# KEYFRAME — AI VIDEO EDIT mode (talking-head editor)

## Context
KEYFRAME today is a TEMPLATE_GENERATION studio: prompt/URL → brief → script → storyboard → assets → HyperFrames
composition (HTML+GSAP captured by headless Chrome) → MP4, via `/api/projects` and the LangGraph production graph
(`server/src/agents/graph.js`). Users now want the opposite direction: upload a raw talking-head video and get a polished,
captioned, B-rolled, scored, branded, social-ready edit they can change element-by-element. This plan adds a separate
**AI_VIDEO_EDIT** mode as its own subsystem that reuses KEYFRAME's LLM client, stock providers, audio mixer, brand kit,
language tables, HyperFrames renderer and QA patterns — without routing uploads through the template pipeline and without
changing that pipeline's behavior.

The brief says "Motion Canvas"; KEYFRAME's engine is **HyperFrames** (supports transparent MOV/WebM). All such references map to it.

**Audit basis** (8 parallel subsystem audits + critic + 3 design agents + provider research). Findings that shape the design:
- Existing job routes are anonymous and public (`GET /api/projects` lists every job; `public/videos` is static) → edits need a
  private, owner-checked store, not `jobs.json` rows.
- Janitor deletes `jobs/<id>` 1h after done and `uploads/*` after 24h → editable projects need their own directory + retention.
- Global `express.json({limit:"64kb"})`, CORS allows only GET/POST + Content-Type, and CORS reflects any origin with credentials
  when `WEB_ORIGIN` is unset → path-scoped JSON parser, POST-only mutations, Origin guard.
- Boot drain `server.js:85-94` crashes on any recovery entry without `task`; dev-watch only reads `jobs.json`.
- Many shared files carry the user's uncommitted edits; several boot-required modules are untracked → **additive only**, no git
  worktrees (HEAD can't boot).
- Stock VIDEO supply may be dead (commit 3f39255: Pixabay key rejected, Pexels empty); music/SFX via the keyless Pixabay bridge work.
- ffmpeg 8 full build has libass, xfade, silencedetect, afftdn, ebur128, scdet, blackdetect/freezedetect; host is 2-core i5, 11.9 GB.
- Existing STT is segment-level only and silently returns an empty transcript on failure.

## Principles
1. **Edit Plan is the single source of truth.** Track-based: A-Roll segments · Cuts · Captions · B-roll · Effects · Transitions ·
   Graphics · Music · SFX · Branding. Stable ids, `reason`/provenance, `origin ai|user`, `locked`, tombstones on remove.
2. **LLM = director, never the viewer.** It sees transcript text, metadata and a few low-res frames. Deterministic services do
   probing, transcoding, silence/energy, word timing math, cut math, reframing, caption layout, rendering, loudness.
3. **Deterministic beats generative wherever checkable; every enhancement fails open**; STT failure is loud (NEEDS_ATTENTION).
4. **Small edits never re-analyze.** Stage checkpoints with input hashes; render cache keyed by plan slices; audio-only changes remux.
5. **Preview == export.** One composition JSON drives both profiles; `compositionHash` proves it.
6. **Template generation stays byte-identical.** New code under `server/src/video_edit/**` and `web/src/screens/aiEdit/**`.

## AI provider strategy — OpenRouter + KIE only (user decision)
No local ML models (no faster-whisper, OpenCV, local CLIP, transformers.js, ffmpeg whisper filter). ffmpeg DSP and pure JS are
fine. No Python anywhere → Docker image unchanged. Enforced by a static policy test.

| Need | Primary | Fallbacks |
|---|---|---|
| Word-level STT | OpenRouter `POST /api/v1/audio/transcriptions` — JSON `input_audio{data base64, format}`, `response_format:"verbose_json"`, `timestamp_granularities:["word"]` (Whisper-Large-V3/-Turbo class); ≤25 MB & ~60 s processing → ~45 s MP3 16 kHz mono chunks cut at silence midpoints (disjoint, sample-exact), per-chunk checkpoints | ① KIE `elevenlabs/speech-to-text` (Scribe; keeps fillers): `POST https://api.kie.ai/api/file-stream-upload` → `data.downloadUrl` → `jobs/createTask` → poll `jobs/recordInfo` (taskId persisted before polling; pattern `tts.js:180-273`) ② audio-capable chat model via `openrouter.chat` on energy-VAD speech islands, words aligned by syllable weight snapped to energy minima (`timing:"approx"`) ③ NEEDS_ATTENTION `STT_FAILED` with retry-missing-chunks / continue-without-captions |
| Fillers | provider verbatim words + **disfluency recovery**: speech-energy regions ≥150 ms not covered by words → chat model "verbatim incl. fillers" | per-language filler lexicon + repeat/false-start detection |
| Face / framing | vision chat model (`ve_faces`) normalized bboxes on ≤24 sampled 384 px frames, 6–8 per call, pure-JS interpolation + median/EWMA smoothing | `faceTrack:"assumed"` (center-weighted), face QA findings downgraded |
| Content analysis, Edit Director, B-roll judge, vision QA | `openrouter.chat` stages `ve_content`, `ve_director`, `ve_broll_judge`, `ve_stt_disfl`, `ve_framing_qa`, `ve_qa` (jsonMode, zod + one repair re-ask via `ai/llm.js callJson`; `kie:` aliases allowed via `stageModels`) | deterministic analysis / heuristic director / lexical-only B-roll ranking / deterministic QA |
| Noise reduction | ffmpeg `highpass` + `afftdn` driven by measured noise floor | opt-in KIE `elevenlabs/audio-isolation` (10 MB → chunked) |

Cost & resilience: config-driven per-minute estimates shown before start; per-project cap (default $0.50) + global daily cap;
`openrouter.checkBudget()` before paid stages; process-wide circuit breaker per provider (402/401/403/429/timeouts); optional
calls dropped first (vision QA → B-roll judge → face pass → disfluency recovery); every call's cost recorded (`usage.cost`,
KIE `creditsConsumed`) into `UsageTracker` + `project.cost`. Privacy: upload requires explicit consent ("audio segments and small
still frames are sent to OpenRouter/KIE; the full video never is"); `privacy.allowCloudVision:false` sends zero images; an
`llmGuard` rejects video parts, >8 images, >640 px, oversized payloads.

**Provider probe results (measured 2026-09-14, see `ANALYSIS.md` §1):** STT primary = OpenRouter `microsoft/mai-transcribe-2`
(word timestamps, keeps every filler and repeat, ISO language detection, 71 ms median onset error, ≈ $0.10/hour, 10-min files OK);
fallbacks `openai/whisper-large-v3-turbo` → `deepgram/nova-3` (explicit language required) → speech-island chat
(`meta/muse-spark-1.3-contributor`, letter island ids). KIE `elevenlabs/speech-to-text` stalled/failed during the probe → **disabled by
default** (upload host `kieai.redpandaai.co`; `api.kie.ai` upload 404). KIE chat routes only hear audio sent as `image_url` data URIs.
Faces = `google/gemini-3.5-flash-lite` boxes (≈ $0.0005/image, IoU .97+ vs gemini-3.5-flash). Pexels + Pixabay video keys work.
Typical 60 s video AI cost ≈ $0.02–0.04.

## Edit Plan (`server/src/video_edit/plan/schema.js`, zod) — the single source of truth
Conventions: ids `<prefix>_<nanoid8>`; seconds at ms precision snapped to 30 fps; **speech-anchored elements live on the SOURCE
timeline** and `resolved` output times are re-derived every revision, so toggling a cut never re-runs analysis; removed items are
tombstones (`status:'removed'`), so restore/undo are free.
```
Anchor   = {kind:'words',w0,w1} | {kind:'src',srcIn,srcOut} | {kind:'out',outIn,outOut}
Resolved = {outIn,outOut,collapsed}            // anchor fully cut away → hidden, not deleted
Origin   = 'ai'|'heuristic'|'user'
EditPlan {schema:'kf.edit_plan',version:1,projectId,revision,parentRevision,createdBy:'director'|'heuristic'|'user'|'qa-repair',
  source{assetId,sha1,durationSec,fps:30,w,h,analysisVersion,transcriptHash,timing:'word'|'approx'},
  output{aspect:'9:16'|'16:9'|'1:1',w,h,fps:30,bg:'none'|'blur'|'brand'},
  settings{captionStyle,captionLang,maxWordsPerLine,brandColors[],music,brollIntensity:'low'|'medium'|'high',
           effects:'subtle'|'dynamic',removeFillers:'off'|'light'|'aggressive',removeSilence,silencePace,autoJumpCuts},
  timeline{pieces[{srcIn,srcOut,outIn,rate,kind:'play'|'hold'|'speed'}],outDurationSec,mapHash},   // derived cache
  aRoll{segments[{id,type:'HOOK'|'TALKING_HEAD'|'EMPHASIS'|'SCREEN_CONTENT'|'CTA',anchor,resolved,sentenceIds[],importance,
     intent:'hook_grab'|'explain'|'proof'|'story'|'emphasis'|'aside'|'cta',faceRequired,
     framing{mode:'auto'|'static'|'follow',zoomBase,keyframes[{src,cx,cy,zoom}] /*normalized → aspect-independent*/,userCrop?,locked},
     reason,origin,locked}]},
  cuts[{id,kind:'SILENCE'|'FILLER'|'REPEAT'|'FALSE_START'|'JUMP_CUT'|'USER',srcIn,srcOut,raw{srcIn,srcOut},
     snap:'rms_gap'|'word_edge'|'island_edge'|'none',wordRange,confidence,
     controlledBy:'removeSilence'|'removeFillers'|'autoJumpCuts'|null, enabled /*effective = enabled && settings[controlledBy]*/,
     reason,origin,locked}],
  captions{enabled,styleId,lang,sourceLang,position{policy,faceAvoid,yOverride?},highlight:'none'|'color'|'blob'|'sweep'|'single_word',
     overrides{wordText{},insertions[],hiddenWords[],hiddenCues[],cueY{},emphasis{}},      // user edits survive re-chunking/style changes
     cues[{id:'c_<firstSrcWordIndex>',anchor,resolved,text,lines[],words[{i,text,outStart,outEnd,emphasis,conf}],
           timingMode:'words'|'proportional',pos?,hidden,edited}],
     translations{[lang]:{cues,sourceHash,quality}}},
  broll[{id,ordinal,anchor,resolved,sentenceId,segmentId,layout:'FULL'|'PIP'|'SPLIT',layoutParams{corner?,scale?},
     intent:'illustrate'|'context'|'data'|'emotion',queries[{text,kind}],reason,
     chosen:AssetRef|null, top:AssetRef[≤8] /*full list in broll/candidates/<id>.json*/, motion?,
     status:'pending'|'ok'|'missing'|'removed',origin,locked,userModified}],
     // AssetRef {assetId,provider,providerId,type,path,sourceUrl,license,attribution,w,h,durationSec,trimIn,dhash,scores{…,total},judge}
  opportunities{broll[],effects[]},                            // scored unused slots → intensity changes need no LLM
  effects[{id,anchor,resolved,enabled,reason,origin,locked} & one of PUNCH_IN{zoom 1.05–1.35,center} | PUNCH_OUT{toZoom} |
     ZOOM_EMPHASIS{from,to,dur .4–1.2,ease} | REFRAME{cx,cy,zoom} | FREEZE{atSrc,hold .2–.8} | SPEED{rate .5–2,target}],
  transitions[{id,kind:'CUT'|'DIP_BLACK'|'DIP_WHITE'|'FLASH'|'CROSSFADE',at,dur .08–.4,enabled,reason,origin}],
  graphics[{id,kind:'HOOK_TITLE'|'KEYWORD'|'STAT'|'LOWER_THIRD'|'CTA'|'LOGO_OUTRO',anchor,resolved,text{title≤32,subtitle?,value?},
     templateId,vars,region,renderer:'hyperframes'|'ass',render{cardHash,path,status:'pending'|'ok'|'fallback'|'failed'},
     enabled,reason,origin,locked}],
  music{enabled,track{assetId,path,provider,query,mood,license,durationSec},candidates[≤3],volume .06–.16,
     envelope[{anchor,volume}],duck{enabled,depthDb},fadeIn,fadeOut,reason,origin} | null,
  sfx[{id,cue:'whoosh'|'swoosh'|'pop'|'click'|'riser'|'impact'|'sparkle'|'ding'|'transition',path,
     anchor{elementId,edge:'in'|'out',offset},resolved{outAt},volume .15–.45,license,attribution,enabled,reason,origin}],
  branding{logo{assetId,path,placement:'tl'|'tr'|'bl'|'br',scale .08–.2,opacity,marginPct,show}|null,
     palette{primary,accent,text,onAccent,source},font{family,ttf},recolorFootage:false},
  provenance{director{model,stage,costUsd,fallback},rhythm{rules,adjustments[{id,rule,action}]},ops[{opId,at,op,ids}]},
  qa{revision,findings[]}|null }
```
`plan/outline.js outline(plan)` renders the user's tree (A-Roll segments by type + Captions/B-roll/Effects/Music/SFX/Branding/
Transitions tracks on the output timeline) — shown in the editor and in API responses. `plan/ops.js applyOps(plan, ops)` is the
only mutator (validated per op, atomic batch, new immutable revision); `plan/revisions.js diffLevels` decides render invalidation.

## Timeline math (`plan/timeline.js`)
- Frame grid: mezz CFR 30 fps, audio 48 kHz → 1600 samples/frame exactly.
- Effective cuts `C = {enabled ∧ (controlledBy=null ∨ settings[controlledBy])}`, quantized inward (`ceil`/`floor` to frames),
  merged when <2 frames apart; kept ranges `K = [0,D] \ ∪C` with 0.15 s head/tail pad; `minKeep 0.35 s` (wordless short piece
  absorbed into the cut; short piece with words disables the shorter adjacent cut, recorded as rhythm adjustment);
  `minRemove` SILENCE/JUMP_CUT 0.25 s, FILLER 0.15 s.
- Pieces `len=(srcOut−srcIn)/rate` (hold = hold), `outIn_i = Σ len_j`; `srcToOutStart(t)` inside a cut → next piece start,
  `srcToOutEnd(t)` → previous piece end; resolved span <2 frames (<0.4 s for B-roll/graphics) → `collapsed`; binary search lookups.
- RMS envelope (16 kHz, hop 10 ms, window 20 ms): floor = P10 of non-speech, speech = median inside words; word edges refined
  (end forward ≤150 ms while > floor+10 dB, start back ≤120 ms, clamped to neighbours).
- Gap cut between words k,k+1: `a` = first frame ≥ end_k+.04 with RMS < floor+6 dB for 30 ms (clamped to [end+.04,end+.20]),
  `b` symmetric before start_{k+1}; `cut=[a+keep/2, b−keep/2]`, keep .20 s subtle / .12 s dynamic.
- Filler cut `[w.s−.03, w.e+.05]` ∪ adjacent silence; veto (`coarticulated`) if both 40 ms flanks > speech−6 dB; approx timing
  requires `conf ≥ .6` + dip/island edges. Voice joins get 6 ms `afade`.
- Jump-cut framing alternation at non-scene-change joints removing ≥.12 s (not under FULL B-roll): zoom alternates 1.0 ↔ Z1
  (1.10 subtle / 1.20 dynamic); export upscale `outH/(cropH/Z)` ≤ 2.0 else Z capped; if Z1 < 1.04 alternate ±4 % x-offset and
  flag `lowRes`; headroom ≥8 % of crop height; face cy target .38 (9:16) / .42 (1:1) / .40 (16:9).

## Edit Director + Rhythm Engine (`director/*`)
**`ve_director`** (LLM, zod) returns an *over-complete ranked opportunity list* so intensity/effects changes never need another
LLM call: `{broll[{sentenceId,wordAnchor?,priority,layout,media:'video'|'image'|'either',queries[2–4 concrete nouns ≤5 words],reason}],
punchIns[{sentenceId,wordText,kind,priority}], graphics[{kind,sentenceId,title,subtitle?,value?,priority}],
sfx[{anchor:'broll_in'|'graphic_in'|'punch_in'|'section',ref,cue,priority}], music{include,mood,query,energy},
transitions[{afterSentenceId,kind}], hookTitle?, ctaCard?}`.

**Rhythm engine** (`rhythm.js`, deterministic, greedy by priority on the output timeline; locked/user elements kept first and
consume budget):
1. B-roll never: before `hookGuard`, on `faceRequired` (sincere/emotional/personal) sentences, on the CTA, in the last 2 s, on
   SCREEN_CONTENT, where the face is absent, on collapsed anchors.
2. Duration clamped to the table; start = anchored word −.10 s, end = word +.15 s, preferring to end on a joint (+.1 priority).
3. Accept only if coverage ≤ max, gap ≥ minGap, items/min ≤ cap, face shown ≥ minFaceAfter after every FULL, video starts and ends on face.
4. Punch-in at the word, punch-out at the next joint or after 2–4 s; skipped when shaky or `lowRes`.
5. Hook title only in first 3 s with hook strength ≥.5; CTA card only if a CTA exists; KEYWORD/STAT need ≥2.5 s without FULL B-roll.
6. SFX only on accepted visual events; never the same cue twice in a row; none within .3 s of a filler joint.
7. Transitions: CUT by default; DIP/FLASH only at segment boundaries with a kept pause ≥.3 s.
8. Music .08 (calm)–.12 (energetic), clamped .06–.16; +.04 before first word and after CTA; .06 under `faceRequired` sentences.

| B-roll | low | medium (default) | high |
|---|---|---|---|
| max coverage | 12 % | 25 % | 40 % |
| items / min | 2 | 4 | 7 |
| min gap (face between) | 8 s | 5 s | 3 s |
| duration | 1.8–4.0 s | 1.5–4.5 s | 1.2–5.0 s |
| hook guard | 2.5 s | 2.0 s | 1.5 s |
| min priority | .70 | .55 | .40 |
| back-to-back FULL | no | no | ≤2 (≤8 s) |
| min face after FULL | 3 s | 2 s | 1.5 s |

| Effects | subtle (default) | dynamic |
|---|---|---|
| jump-cut zoom Z1 | 1.10 | 1.20 |
| emphasis punch-ins | ≤2/min, ≥10 s apart | ≤5/min, ≥5 s apart |
| ZOOM_EMPHASIS | off | ≤2/min, Δ ≤.12, .6–1.2 s |
| FREEZE / SPEED | none | ≤1 freeze .4–.6 s; speed only non-speech A-roll or B-roll |
| non-cut transitions | ≤1, ≥20 s apart | ≤3, ≥12 s apart |
| SFX | ≤2/min, ≥6 s apart, vol .20–.30 | ≤5/min, ≥3 s apart, vol .25–.40 |
| graphics (+ hook, CTA ≤1 each) | ≤1/min | ≤2/min |
| silence remove ≥ / keep | .55 s / .20 s | .35 s / .12 s |

**Heuristic director** (no LLM; `provenance.director.fallback=true`): hook = sentences in first ≤4 s; CTA via per-language regex;
B-roll on sentences with TF-IDF salient nouns and first-person-emotional ratio <.3 (priority = salience × min(1, dur/2.5), queries
from `subjectQuery`); punch-ins on superlatives/numbers/"key/secret/important"/"!"; STAT graphic on number+unit; music energetic
if words/s > 3; whoosh only on FULL B-roll. Guarantees an edit with captions + silence/filler cuts even when every LLM is down.

**Transcript structuring** (`transcript.js`): sentences split at `.?!。？！।؟`, pauses ≥.7 s (≥4 words), 25-word cap, <3-word merges;
**pure fillers** default-on per language (um/uh/erm/er/ah/hmm · अं/उम्म · eh/em · euh/heu · äh/ähm · hã/ahn · اممم · えー/えーと);
**discourse fillers** (like, you know, I mean, basically, este, o sea, genre, tipo, né, يعني, あの, まあ) only when pause-bounded and
confirmed by `ve_content` (opt-in "aggressive"); stutter = immediate n-gram (≤4) repeat within 1.5 s → cut first copy; false start
= ≤7-word fragment + pause ≥.3 s + ≥60 % LCS with next sentence → cut fragment; retake = Jaccard ≥.6 / LCS ≥.7 within 20 s → keep
higher-confidence take.

## Analysis modules (`server/src/video_edit/analysis/*`) — artifacts cached per stage
- **Ingest** (`ingest/validate.js`, `ingest/normalize.js`): strict probe → mezzanine (CFR 30, yuv420p, ≤1920 long edge, 1 s GOP,
  rotation applied, HDR tonemapped) + 540p proxy + `voice48k.wav` + `audio16k.wav` + poster.
- **Technical** (`technical.js`): duration, fps, resolution, aspect, codec, bitrate, orientation; `scdet` scene changes,
  `blackdetect`, `freezedetect`, `signalstats` YAVG/YDIF (exposure + motion per sampled frame), `cropdetect` (letterbox).
- **Audio** (`audio.js`, pure JS on 16 kHz PCM + ffmpeg): 10 ms RMS envelope, noise floor, speech level, speech islands
  (hysteresis 40 ms in / 250 ms out, merge gaps <250 ms, 80 ms padding, split >12 s at deepest dip), silences, clipping
  (`astats` peak/flat factor), `ebur128` loudness → drives denoise decision and silence cuts.
- **STT** (`stt.js` chain, see provider table): per-chunk checkpoints; word validation (monotonic, inside chunk, ≥60 % of VAD
  speech covered); overlap merge. **Island fallback** (`islands.js`, `word_timing.js`, `syllables/<lang>.js`): batches ≤30 s /
  ≤12 islands per chat call with verbatim prompt (fillers, repeats, false starts; `sp` spoken form for digits/Japanese reading);
  validation (1.5–9 syllables/s, hallucination n-gram check, boundary de-dup); syllable weights per language (vowel groups for
  Latin, akshara for hi, mora for ja, letter heuristic for ar; ×1.8 fillers, ×1.3 phrase-final); boundaries allocated by weight
  then snapped to energy dips with a monotone DP (cost `((b−t)/σ)² − 0.15·depth − 1.0·[pause dip]`); pause dips ≥150 ms force
  boundaries; per-word `conf`; filler/repeat cuts only with `conf ≥ 0.6` and a dip/island edge on both sides.
- **Disfluency recovery**: voiced regions ≥150 ms (RMS > floor+10 dB, low ZCR, pitch strength) not covered by any word →
  verbatim chat pass → `FILLER` candidates (Whisper-class STT drops "um/uh").
- **Transcript** (`transcript.js`, `lexicon/<lang>.js` for en/hi/es/fr/de/pt/ar/ja): word edge refinement to RMS, sentences,
  semantic segments, pure fillers vs discourse fillers ("like", "you know" = opt-in), repeats/false starts, CTA patterns.
- **Faces & framing** (`frame_sampler.js`, `faces_llm.js`, `track_smooth.js`): sample budget `clamp(ceil(dur/1.5),12,120)` capped
  by cost settings (scene starts + 1 per 4 s + high-YDIF motion), 384 px, one ffmpeg `select` run; `ve_faces` returns
  `box_2d` 0–1000 head boxes + role/facing + shotType, background, screen content, on-screen text, lighting; validation (box h
  3–70 %, aspect 0.55–1.5), primary speaker by area/IoU continuity, Hampel filter, gap interpolation ≤3 s, reset at scene cuts,
  dead-zone camera (±12 % / ±8 %) → framing keyframes; optional closed-loop framing QA on 6 planned crops (±5 % correction, 1 lap).
- **Content** (`content.js`, `ve_content`): input = sentences with ids/timings + keywords + visual summary (never video);
  output: topic, category, tone, audience, hook candidates, key moments, per-sentence importance 0–1, role (hook/point/example/
  stat/story/cta/aside), sincere/emotional flag (protected), B-roll worthiness + concrete visual queries, emphasis words, music
  mood/energy, SFX opportunities; screened with `prompt_moderation.screen` in ~3000-word chunks (tier-1 → hold for review).

## B-roll (`server/src/video_edit/broll/*`) — no CLIP
- **Retrieval**: new raw mappers `pexels_raw.js` / `pixabay_raw.js` that keep id, duration, renditions, thumbnails/video pictures,
  tags, photographer attribution (existing `pexels.js`/`pixabay_api.js` untouched); keyless `stills` via Openverse images
  (`asset_sources/openverse.js`); `Promise.allSettled` per query, orientation matched to output, token-bucket rate limits
  (Pexels 200/h, Pixabay 100/60 s), 24 h search cache (`_shared/asset-search`), queries post-filtered with
  `query_terms.subjectQuery` (whitelisting 2-letter terms like AI/VR/5G).
- **Scoring**: prior `= 0.55·lexical(BM25-lite tags/title vs query+sentence keywords) + 0.15·provider rank + 0.30·technical
  (resolution, cover loss via asset_fit math, duration fit, grey stdev)` → top 8 per item → dHash de-dup (Hamming ≤8, thumbnails via
  `util.imageDHashStats`) → `ve_broll_judge` on thumbnails (videos as 3-frame strips 25/50/75 %), ≤3 items per call, candidates
  shuffled deterministically per item id, returns relevance 0–10, literalMatch, quality, issues (watermark/text/faces/offtopic/
  low_quality/cliche/unsafe), composition, bestLayout. Final `total = 0.40·semantic + 0.12·visual + 0.10·resolution +
  0.10·aspect + 0.08·composition + 0.05·brand + 0.10·durationFit + 0.05·diversity − 0.15/issue` (`unsafe` excluded).
- **Thresholds**: accept `relevance ≥ 6 && total ≥ 0.55` (video) / `≥ 0.50` (image); else item `missing` → speaker stays.
  Judge unavailable → lexical-only with `lex ≥ 0.5 && technical ≥ 0.6` (nothing accepted at Low intensity), flagged.
- **Persistence**: ranked candidates (top 8 with scores, thumbs, license/attribution) stored per item → Replace needs no refetch;
  chosen clips downloaded (`util.download`, rendition near target size), validated (`util.validateClip`, `gradeClip`), copied into
  the project (`assets/broll/`), conformed per profile (`broll/conform.js`: cover crop around focus, fps 30, trim, `-an`; stills
  → Ken Burns). Credits written to `credits.txt` next to exports (Pexels photographer, CC-BY SFX).

## AI cost estimate per minute of source (to be confirmed by probes; real spend recorded)
| Stage | via KIE gemini-3.6-flash route | via OpenRouter gemini-3.5-flash |
|---|---|---|
| STT (transcription endpoint or islands) | ≈ $0.004–0.012 | ≈ $0.013–0.04 |
| Faces + visual semantics (~40 frames) | ≈ $0.009–0.027 | ≈ $0.033–0.10 |
| B-roll judge (medium intensity) | ≈ $0.007–0.02 | ≈ $0.025–0.075 |
| Content + director + optional framing QA/translation | ≈ $0.004 | ≈ $0.015 |
| **Total per minute** (+ ≈ $0.012 / $0.05 fixed per video) | **≈ $0.02–0.07** | **≈ $0.08–0.24** |
Levers: contact-sheet grids for face presence, judge only selected items at Low intensity, framing QA only on export.
Estimated wall time per source minute for network stages: STT 15–25 s, faces 20–30 s, judge 15–25 s, content+director 30–60 s.

## Captions (`server/src/video_edit/captions/*`) — libass, not HyperFrames
Why: one FFmpeg pass, frame-exact, ~0.3 s startup, caption edits re-burn cheaply; a HyperFrames caption layer would make
Chromium capture every frame of the whole video (verified libass on this ffmpeg: FriBidi+HarfBuzz shaping; woff2 not loadable;
big fontsdir ~6× slower; silent per-glyph fallback) → **bundle OFL TTFs** in `server/assets/fonts/edit/` (DM Sans Bold, Archivo
Black, Figtree Bold, Anton, Barlow Condensed Bold, Noto Sans Devanagari/Arabic/JP Bold, ~5 MB) and copy only the 2–4 needed
into the project `fonts/` dir; the same TTF is base64-inlined into HyperFrames cards (font parity).
- **Grouping/line breaks** (`group.js`): words on the OUTPUT timeline (removed fillers dropped), measured width per language
  (`caption_lang.js` charWidth), max lines/cue seconds per style, break at punctuation / pauses > 250 ms / sentence ends.
- **Placement** (`place.js`): safe areas per aspect (9:16 bottom band above platform UI), avoid the smoothed face box, seam
  position during SPLIT, default during FULL B-roll, hysteresis (position changes ≤ once per 4 s unless forced).
- **Styles** (`styles.js`): `clean`, `bold_pop` (uppercase, brand-accent active word, pop 85→100 %), `karaoke_blob`
  (active word brand outline blob), `single_word`, `minimal_lower` (box, for sincere content), `brand_bar`; highlight color =
  `brand_kit.resolveBrand` accent nudged to ≥3:1 (`brand_kit.js:99,244`); hi/ar/ja overrides to Noto (RTL for ar).
- **ASS** (`ass.js`): PlayRes = output size; `#RRGGBB`→`&H00BBGGRR`; escape `\ { }`, `\N`, `\h`; per-word highlight = one
  Dialogue per active-word interval with identical `\an2\pos` and full text, only `\c` changes (no reflow jitter); pop via `\t`
  on the first event; blob = layer 1 with alpha-hidden non-active words; `Fontname` = TTF name-table family (tiny parser).
  Burn-in: `ass=f=cache/ass/<hash>.ass:fontsdir=fonts:shaping=complex` with `cwd=projectDir`.
- **Translation**: sentence-level `translate.translateLines` (batched ≤60), cues re-split by measured width, time spread
  proportionally, no word highlight on translated cues; cached per sentence hash.
- **Export**: `captions.toSrt/toVtt` (`captions.js:60,78`) on output-timeline cues.

## Effects & transitions (exact FFmpeg techniques, `render/exprs.js`)
Crop geometry from mezz W×H and output aspect A: base `bw=min(W,H·A)`, `bh=bw/A`; zoom z → `w=even(bw/z)`, `h=even(bh/z)`;
`x=clamp(cx·W−w/2)`, `y=clamp(cy·H−0.38·h)`.
| Effect | Technique |
|---|---|
| Static framing / PUNCH_IN / PUNCH_OUT | `crop=w:h:x:y,scale=outW:outH:flags=lanczos,setsar=1`; punches are hard cuts at a word start (piece split) |
| Reframe follow (16:9→9:16) | `crop` with per-frame `x/y` piecewise smoothstep expressions (≥0.4 s eases) in `-filter_complex_script` |
| ZOOM_EMPHASIS (animated) | isolated 0.6–1.2 s piece with `perspective` (eval=frame, 1-based `in`) — zoompan rejected (integer rounding wobble); settled by spike S1, exact expression in RENDER.md §4 |
| FREEZE | `tpad=stop_mode=clone` + `apad` on the voice stem at the same joint |
| SPEED (non-speech only) | `setpts=(PTS-STARTPTS)/R,fps=30` + `atempo` |
| Blur fill / SPLIT 9:16 | blurred scaled background under contained FG / face bottom half + B-roll top half `vstack` (A-roll level) |
| FULL B-roll | conformed clip `-itsoffset`, alpha fades 0.12 s, `overlay=eof_action=pass` |
| PIP card | pre-scaled clip + `alphamerge` rounded mask PNG + shadow PNG (no `geq`) |
| Stills Ken Burns | `-loop 1` + 2× oversampled `zoompan` |
| DIP_BLACK / FLASH | color source with alpha fades overlaid at the joint (duration unchanged) |
| CROSSFADE (topic changes only) | both neighbours re-encoded as one piece with `xfade`+`acrossfade`; time map gets −d overlap |
| Logo | `-loop 1` PNG, scaled, `colorchannelmixer=aa`, `overlay`; SVG rasterized via puppeteer-core |
Hard cuts for every jump cut and B-roll entry on the phrase's first word; soft transitions only at topic boundaries with a kept
pause ≥0.3 s, within rhythm caps.

## Rendering architecture (`render/*`)
**Edit Plan → Composition Builder → Composition JSON → FFmpeg renderer (+ HyperFrames cards) → audio mix → QA.**
- `compose.js buildComposition(plan, ctx, profile)` is pure: integer frames/samples; `base.chunks[]` of A-roll pieces
  (src in/out frames, framing, layout), `overlays[]` (broll/pip/card/dip/logo with out frames, geometry, fades, z),
  `captions {assPath}`, `audio {voice pieces + chain, music + envelope, sfx}`, outputs. Chunk hash **excludes out-time
  offsets**, so toggling an early cut keeps later chunks cached.
- **A-roll base**: ~6–10 s chunks cut only at piece joints → `ffmpeg -ss/-to` + `trim/setpts/framing/concat` script →
  `libx264 ultrafast crf 12, -bf 0, IDR at 0, fixed timescale` → concat demuxer `-c copy`. No audio in chunks (no AAC gaps).
- **Composite** (one pass): base → B-roll/PIP → dips → cards (`-c:v libvpx-vp9` before `-i` to keep alpha) → `ass=` → logo;
  `veryfast crf 20` export / `ultrafast crf 30` preview; `+faststart`; `-threads 3`.
- **Voice stem**: `atrim` by exact sample (frame×1600) + 6 ms fades + `concat` + `highpass` [+ notch][+ `afftdn` from measured
  noise floor][+ `dynaudnorm`][+ `deesser`] → 2-pass static-gain loudnorm −16 LUFS + `alimiter` (pattern `tts.js:517-546`).
- **Mix**: `audio_mix.mix({videoPath: composite, ttsPath: voice.wav, musicPath, musicVolume, musicEnvelope (atSec),
  sfx:[{path,startSec,volume}], targetLufs:-14})` (`audio_mix.js:126`, `-c:v copy`) — music/SFX edits re-run only this.
  SFX from local `assets/sfx/<resolveCue>.mp3` (`sfx_library.js:33`); music candidates via `pixabay_bridge.firstAudioUrl(query,
  'music',{index:0..2})` → `audio_sources.fetchMusic` (pad fallback); every layer validated with `media.probeDurationSec`.
  Spike S7: `VOICE_CLEAN` does not over-compress (crest change < 0.2 dB) → no `voiceChain` param; `mix()` alone misses TP ≤ −1 dBTP →
  a limiter post-pass follows the mix (RENDER.md §8); final mix audio is 44.1 kHz (hardcoded in `audio_mix.mix`).
- **HyperFrames cards** (`cards/templates/{hook_title,keyword,stat,lower_third,cta,logo_outro}.js` → `{indexHtml, metaJson}`):
  region-sized (e.g. 1080×560), `data-composition-id="vid"`, GSAP inlined from `node_modules/gsap`, synchronous
  `window.__timelines['vid']`, no randomness/network; gates `validator.validate` (`validator.js:144`) + `runtime_check`
  (`runtime_check.js:68`); render with `hyperframes_cli.cliFor('render',['--format','webm',…])` + `spawnCompat` + watchdog
  `max(90 s, dur×30 s)` + killTree (never `renderer.render`, which publishes to `public/videos`); ProRes 4444 alternative; on any
  failure an ASS text card fallback. Preview uses the ASS card immediately; export waits for real cards. Card hash =
  template@version + vars + palette + font + dims.
- **Profiles**: `preview` 540-short-edge (ultrafast) and `export` 1080-short-edge (veryfast crf 20); crop rects in mezz pixels
  shared by both; `compositionHash` stamped on every render.
- **Cache & invalidation** (`plan/revisions.diffLevels`): caption text/style/position → ASS→composite→mix; caption language →
  translate→ASS→…; B-roll replace/remove/add/layout → conform→composite→mix; SPLIT/effect/crop → affected chunks→base→…; cut
  toggle / filler / silence / jump-cut settings → re-derive map → changed chunks → voice → re-time ASS/overlays/SFX → composite →
  mix; music/SFX → mix only; logo/brand → ASS+cards→composite→mix; aspect → all chunks + cards + ASS + conform (**no re-analysis**);
  intensity → rhythm re-select (no LLM) → retrieval for newly selected items only.
- **Serialization**: one ffmpeg/HyperFrames lane (concurrency 1) gated by the heavy-CPU slots; LLM/STT/vision network calls
  run beside it.

## Spikes to run first (Phase 2, in the scratchpad)
S1 animated zoom smoothness/cost (`perspective` vs `zoompan`, confirm `crop` w/h can't animate) · S2 chunk exactness through
concat demuxer (frame count = Σ pieces, constant pts steps) · S3 libass: small fontsdir, bold family match, no jitter with
per-word colour events, blob, pop, ar/hi/ja shaping, brand colour accuracy · S4 HyperFrames transparent card: webm alpha kept
only with `-c:v libvpx-vp9` before `-i`, timing, mov alternative · S5 **provider STT probe**: OpenRouter transcription model with
`words[]`, KIE Scribe result shape, filler retention, word-onset error vs RMS · S6 **vision bbox probe**: Gemini-class boxes on
sampled frames vs known geometry, `input_audio` passthrough in `openrouter.chat` · S7 voice-stem joins click-free, A/V sync ≤1
frame, −14 ±1.5 LUFS through `audio_mix.mix`, VOICE_CLEAN over-compression check · S8 throughput on this CPU (crop+lanczos
ultrafast, composite veryfast, HDR tonemap cost).

## Platform: store, API, security, jobs

### Store (`server/src/video_edit/store.js`, modeled on `server/src/models/template.js`)
- Root `config.videoEdit.dir` (default `server/edits`, refused if inside `public/`, `jobs/`, `uploads/`); index cache
  `server/video-edits.json`; per project `edits/ve_<16>/`: `project.json(.bak)`, `source/original.bin` (never served),
  `work/{mezz.mp4,proxy540.mp4,audio16k.wav,voice48k.wav,chunks/,frames/}`, `analysis/{vad,stt/chunk-*,transcript.words,
  video,faces,content,llm-cache/}.json`, `assets/{broll,music,sfx,logo.png}`, `plan/revisions/r*.json` (immutable, sha256),
  `render/{cards,cache,layout,out}/`, `qa/<renderId>/`, `logs/events.jsonl`, `fallbacks.json`.
- Statuses `QUEUED · PROCESSING · READY · RENDERING · COMPLETED · NEEDS_ATTENTION · CANCELLED · FAILED(input only) · DELETING`
  with a TRANSITIONS legality table; the user's stage names live in `progress.stage` (VALIDATING … QUALITY_CHECK).
- Atomic tmp→fsync→rename (Windows EPERM retry) + `.bak`; per-project mutex; ops carry `expectedRevision` (409 on mismatch);
  renders snapshot `{planRev, planHash}`; `runId` fencing rejects stale writers.
- Boot recovery (`recovery.js`, called from `videoEdit.start()`, never via `db.takeOrphanedTasks`): kill orphaned ffmpeg PIDs,
  requeue PROCESSING from checkpoints, re-queue interrupted renders, re-poll persisted KIE taskIds, crash-loop guard (8 / 25 s).

### Existing files touched (smallest additive diffs)
| File | Change |
|---|---|
| `server/server.js` | require `./src/video_edit`; `app.use("/api/video-edits", express.json({limit:"256kb"}))` **before** `:133`; mount router after `:145`; `videoEdit.start()` after `:177`; stop in `shutdown()`. Failures inside never throw at boot (router answers 503). |
| `server/scripts/dev-watch.js` | `activeEditCount()` reads `video-edits.json` (QUEUED/PROCESSING/RENDERING) added to the deferral check at `:74`. |
| `server/src/config.js` | none — `config.videoEdit` passes through (shallow freeze); `video_edit/settings.js` applies defaults, `VIDEO_EDIT_*` env overrides, present-only validation. `config.example.json` gets a documented `videoEdit` block. |
| root `.gitignore` | `server/edits/`, `server/video-edits.json*`, `server/test-fixtures/`, e2e output dir |
| `server/package.json` | new `test:edit*`, `fixtures:edit`, `e2e:edit` scripts only |
| `web/src/App.jsx` | additive: imports, view keys `aiUpload/aiEdit/aiEdits`, ModeSwitch above AnimatePresence, nav chip, `darkPage` |
| Not touched | `db.js`, `janitor.js`, `routes/*`, `openrouter.js`, `usage.js`, `audio_mix.js`, `renderer.js`, `pipeline.js`, `graph.js`, `transcribe.*`, `keyframe_capabilities.js`, `CreateScreen.jsx`, `api.js` |

`server/src/services/generation_mode.js` exports frozen `GENERATION_MODES = {TEMPLATE_GENERATION, AI_VIDEO_EDIT}`; edit
projects record `mode:"AI_VIDEO_EDIT"`; web mirrors it in `web/src/modes.js`.

### API — `/api/video-edits` (auth + owner on everything but `/health`; not-yours = 404)
Middleware: `originGuard` (WEB_ORIGIN list + same origin + localhost:5173 in dev; strips reflected ACAO on mismatch → 403;
runs before multer) → `requireAuth` + user-exists re-check → `editsEnabled` (503 without SECRET_KEY/ffmpeg/any STT key) →
per-user rate limits → project loader (`^ve_[0-9a-z]{16}$`).

| Route | Purpose |
|---|---|
| `GET /health`, `GET /capabilities` | enabled state, provider breakers, limits, languages, cost-per-minute estimate |
| `POST /` (multipart `video`, optional `logo`, `settings` JSON incl. `consent`, `clientRequestId`) | admission → 201 `{project, costEstimate}` (idempotent) |
| `GET /`, `GET /:id`, `GET /:id/progress`, `GET /:id/events` (SSE, `res.on("close")`, 15 s heartbeat) | list mine, full view, progress |
| `GET /:id/plan[?rev]`, `GET /:id/plan/revisions` | plan + history |
| `POST /:id/ops {expectedRevision, batchId, ops[]}`, `POST /:id/undo`, `/redo` | editing (409 conflict, 422 invalid op) |
| `POST /:id/settings` | render-only changes → ops; analysis-affecting → 202 requeue with estimate |
| `GET /:id/candidates?slotId`, `POST /:id/candidates/search` | B-roll alternatives / stock search |
| `POST /:id/render {kind: preview\|export, planRevision}`, `GET /:id/renders/:rid`, `GET /:id/exports` | renders (cached by planHash+profile) |
| `POST /:id/cancel`, `POST /:id/retry {stage?, mode, continueWithout?}`, `POST /:id/delete {confirm}` | lifecycle |
| `POST /:id/logo` | logo (png/jpg/webp ≤5 MB, re-encoded by ffmpeg) |
| `POST /:id/media-token`, `GET /:id/media/:kind/:key?` | private media: proxy, preview, export, poster, captions (srt/vtt), broll thumbs; `res.sendFile` with Range, `private, no-store`, HMAC token for `<video>` on split deploys |

Limits (configurable): 500 MB upload, 3–300 s duration (config can raise to 600 s), short edge ≥360 px, long edge ≤4096,
12–120 fps, one real video stream + 1–4 audio; per-user 20 projects / 3 GB / 1 running + 2 queued / 10 per day; create 10/h,
ops 120/min, render 20/h.

### Media security (untrusted uploads)
Content-Length + disk-space + quota check before body → custom multer storage streams to `_staging/<nanoid>.upload` with byte
cap and sha256 → magic-byte sniff (ISO-BMFF → `mov`, EBML → `matroska`; playlists/ffconcat/images rejected) → strict ffprobe
(`-protocol_whitelist file -f <demuxer> file:<abs>`, 20 s, stdout cap, zod; rotation/VFR/interlace/HDR detected; metadata/GPS
never stored) → decode three sample windows with `-xerror` → rename into project → normalize to a clean mezzanine
(`-map 0:v:0 -map 0:a:0 -dn -sn -map_metadata -1`, CFR, yuv420p, rotation applied, faststart) + 540p proxy. Every later ffmpeg
call uses the protocol whitelist, forced demuxer, `file:` paths, generated concat lists, `killTree` on abort, capped threads.
Path containment via `realpath` prefix checks; temp files `*.tmp.<runId>.*`; retention per status (intermediates purged 72 h after
last open; original deleted 7 days after mezzanine verified; projects TTL 30 days); delete = DELETING → abort/kill → close
streams → index removal → move to `_trash` → rm with retries.

### Job engine
Own `PQueue({concurrency:1})` (renders priority 1) + **heavy-CPU slots** `max(1, floor(cpus/2))` shared with the template queue
by reading `db.activeCount()` (read-only) — ffmpeg stages wait for a slot (fallback after 600 s: below-normal priority,
`-threads 2`); network stages (STT, LLM, vision) need no slot.

```
VALIDATING → COMPRESSING ─┬→ EXTRACTING_AUDIO → TRANSCRIBING → ANALYZING_CONTENT → SEARCHING_BROLL → SCORING_ASSETS ─┐
                          └→ ANALYZING_VIDEO ────────────────────────────────────────────────────────────────────────┴→ BUILDING_EDIT_PLAN
→ READY (auto-continue) → PREPARING_RENDER → RENDERING → POST_PROCESSING → QUALITY_CHECK → COMPLETED
```
Checkpoints: `inputHash = sha(stage, stageVersion, upstream output shas, relevant settings, provider/model ids, promptVersion)`;
skip when hash + outputs match. Paid responses cached the moment they arrive. Budgets scale with source duration/pixels/CPU
(e.g. COMPRESSING `max(120, 3·D·px·cf)`, RENDERING `max(300, 8·O·px·cf)`); 3 automatic attempts per stage. Progress from
`ffmpeg -progress pipe:1` and per-chunk STT, weighted stages, EWMA ETA (`_metrics/stage-rates.json`). Cancellation registry
`Map<id,{ac, runId, children, pendingKieTasks}>` → killTree + abort signals + fencing; 10 s hard deadline.

### Failure policy (summary of the full matrix)
Admission errors → 415/422 with specific reason, nothing kept · compress/decode failure → FAILED(input) or NEEDS_ATTENTION ·
STT provider errors → breaker + next provider per chunk; all fail → NEEDS_ATTENTION (retry missing chunks / continue without
captions) · vision failure → assumed framing · content/director LLM failure → deterministic analysis + heuristic director
("Simple edit created · Regenerate with AI") · stock failure → next provider → Openverse images (Ken Burns) → none
(`NO_BROLL_FOUND`, speaker stays on screen) · card render failure → static ASS text card → remove · render failure → retry
`-threads 1` → drop overlays → render failed, plan + previous export untouched · mix failure → skip music / single-pass gain ·
vision QA failure → deterministic-only (`visionUnverified`) · integrity blocker after laps → export not promoted.

### QA + auto-repair (`video_edit/qa/*`)
Renderer writes `render/layout/<rid>.json` (element boxes/times, crop per segment). **Deterministic checks**: container/dims/fps
exact; duration ±2 frames; audio present, −14 ± 1.5 LU, true peak ≤ −1 dBTP (`ebur128`); unplanned black (`blackdetect`),
freeze (`freezedetect`), silence; cuts inside words; kept segments < 0.6 s; caption timing vs mapped words (lead ≤0.25 s, lag
≤0.10 s; wider when `approx`), coverage ≥98 % of kept non-filler words, no removed fillers shown, reading speed per language;
safe areas; caption–face overlap; face inside crop ≥95 %; element collisions; B-roll coverage ≤60 % and face-covered ≤50 % of
speech; speaker visible first 2 s; effect density caps; broken assets. **Vision QA** (`ve_qa`, ≤8 frames lap 0, ≤4 changed
windows later, per-frame expectations) with zod `category` enum (CAPTION_UNREADABLE, CAPTION_COVERS_FACE, OVERLAY_COLLISION,
BROLL_OFF_TOPIC, BROLL_WATERMARK, SPEAKER_CROPPED, BLACK_OR_BLANK_FRAME, CARD_RENDER_BROKEN, …). **Category → plan repair op**
(total mapping, test-enforced): move caption anchor, restyle caption box, rebuild cue from words, replace B-roll with next-best
unused candidate or remove, re-reframe from face track, widen cut padding, merge tiny segment, force re-encode segment, static
card fallback, re-run loudness. ≤2 laps; best-lap ledger (pattern `graph.js:2516-2536`, `:2852-2862`); `exports.currentId` never
moves to a render with an integrity blocker; final verdict `{verdict clean|review|weak|blocked, score, headline, issues[], counts,
signals, laps, shippedLap, unverified}` (same shape family as `delivery_quality.js`).

## Frontend (web/)
New files only (plus additive `App.jsx` wiring); design tokens/recipes from `web/src/index.css` (`editor-card`, `btn-mag` only for
Start/Export, `--color-dark-dim` on dark); lint-safe (no non-component exports from `.jsx`, no sync setState in effects).
- **Entry:** `ModeSwitch` "Make a film | Edit my video" rendered by App above `<AnimatePresence>` (CreateScreen untouched);
  nav chip "AI EDIT" (shows upload %); optional landing CTA (`design.html` + `kf-bridge.js` `kf-ai-edit`).
- **Upload** (`AiEditUpload.jsx`, "SC 01 · THE FOOTAGE"): keyboard-accessible dropzone, client-side type/size/duration checks via
  `<video>` metadata with exact copy, XHR upload with progress + cancel in a module-level `uploadStore` (survives navigation),
  collapsed "Customize" (format, caption style, words/line, caption language auto, brand palette, logo, music, B-roll
  Low/Medium/High, effects Subtle/Dynamic, fillers, silence pace Natural/Fast/Extra-fast, jump cuts), consent + privacy line.
- **Analysis** (`AiEditAnalyzing.jsx`, "SC 02 · THE READ"): stage checklist with `aria-current="step"`, ETA, queue position,
  stop, live discoveries (duration, language, words, fillers, silences, topics, hook, B-roll moments, face found), safe to leave
  (resume via `/edits/<id>` / My edits).
- **Editor** (`AiEditor.jsx`, "SC 03 · THE EDIT BAY"): preview player (server render of a revision; A/B `<video>` swap with
  time-map-preserved playhead), AI EDIT SUMMARY chips (`✓ CAPTIONS ✓ 6 B-ROLLS ✓ 3 PUNCH-INS ✓ 2 JUMP CUTS ✓ 14 FILLERS OUT
  ✓ MUSIC ✓ LOGO`), timeline strip (segments colored by type; B-roll/FX/captions/music tracks; dirty ranges hatched), transcript
  & cuts panel (click word → select by `srcWordIndex` → seek), inspector tabs Captions · B-roll · Effects & Graphics · Music & SFX
  · Branding · Format; every item card shows provenance ("Added because line 12 says …", "Words 120–126 · 00:18.2–00:20.9"),
  actions and cost hint; undo/redo; auto "Update preview"; Export dialog (quality, SRT/VTT, "✓ Matches preview r16") + QA card.
- **My edits** (`AiEditList.jsx`), `EditorErrorBoundary` with reset, toasts with Undo, keyboard shortcuts (K/Space play,
  Delete remove, Ctrl+Z), ARIA per component, responsive 390/768/1440.
- **Edit ops** (server-validated, client-optimistic where safe; dirty level decided server-side by hash diff):
  captions (`setEnabled`, `editText` with LCS word-diff re-timing that keeps unchanged word times, `hide`, `setEmphasis`,
  `setPosition`, `setStyle`, `setLanguage`), cuts (`toggle`, `adjust`, `restoreAll`, pacing settings re-derived from stored
  detections), B-roll (`replace` from stored ranked candidates / search / upload, `regenerate{query}`, `remove`/`restore`,
  `setLayout FULL|SPLIT|PIP`, `setTiming`, `add{sentenceId}`, `setLocked`, intensity re-plan only on `origin ai & !locked &
  !userModified` from pre-scored opportunities — no LLM), effects (`toggle`, `adjust`), graphics (`editText`, `toggle`), music
  (`change{candidate|query}`, `remove`, `setVolume`, `setDucking`), SFX (`toggle`, `setVolume`, `muteAll`), branding
  (`setLogo`, `removeLogo`, `setLogoPlacement`, `setPalette`), framing (`adjust{segmentId, offsetX, offsetY, zoom}`, `reset`),
  `output.setAspect` (re-reframe from stored face track, caption re-layout, B-roll re-rank from stored candidates — no re-analysis).

## Delivery phases (each ends with tests on the real workflow)
| Phase | Scope | Exit check |
|---|---|---|
| 1 ✅ | Architecture audit + design (this plan) | approved |
| 2 | Write design contracts to `docs/ai-video-edit/` (architecture, Edit Plan schema, API, QA); `generation_mode.js`; settings/config block; store + recovery + retention; routes skeleton with auth/origin/limits; admission + strict probe + normalize; dev-watch + server.js hooks; regression baseline (`scripts/run-regression.js --save`); **provider capability probe** | unit tests store/routes/media; upload a real file end-to-end to READY-for-analysis; template smoke job still `done` |
| 3 | EXTRACTING_AUDIO (VAD, loudness, noise floor), TRANSCRIBING chain (OpenRouter → KIE → islands), disfluency recovery, transcript structuring (sentences, fillers, repeats), ANALYZING_VIDEO (scdet/black/freeze + vision face track), ANALYZING_CONTENT | fixture videos (8 languages, fillers, long silence, poor audio, moving person, scene cuts) transcribed with word timing; fault-injected STT/vision outages recover |
| 4 | Edit Plan zod schema, timeline math, Edit Director (LLM) + deterministic rhythm engine + heuristic fallback, plan revisions + ops engine | plan validity property tests; LLM-down fixture still yields captions + cuts |
| 5 | B-roll retrieval (Pexels/Pixabay full-field mappers, Openverse images) + scoring (lexical + vision judge + dedup) + candidate persistence; music/SFX selection | "no suitable B-roll" and "asset API failure" fixtures complete |
| 6 | Captions (grouping, line breaks, safe areas, face avoidance, styles, ASS, translation, SRT/VTT, bundled OFL fonts), effects/transitions, voice stem (cut+fades+denoise+−16 LUFS), audio mix via `audio_mix.mix` | caption timing & loudness checks pass on fixtures |
| 7 | Composition builder + FFmpeg renderer (segment cache, B-roll layouts, Ken Burns, xfade, logo, libass) + HyperFrames motion-graphic cards (transparent) + preview/export profiles | 20 s / 60 s renders on this CPU; replace-one-B-roll re-render < 40 % of first |
| 8 | Frontend: upload, analysis, editor, My edits, export | lint + build pass; puppeteer smoke (keyboard, viewports, axe) |
| 9 | QA checks + vision QA + auto-repair laps + best lap + delivery verdict | injected defects repaired; export never regresses |
| 10 | Hardening: fault-injection suite, e2e harness across all required scenarios, performance, docs, final multi-agent review | full acceptance matrix + template regression baseline unchanged |

## Verification
- **Unit tests** (`server/scripts/video_edit_*.test.cjs`, offline with a mock AI provider server and fetch tripwire): store &
  transitions, recovery, checkpoints, media admission (lavfi-generated adversarial files), routes security (anon 401, cross-user
  404, evil Origin 403, no `ve_` in `/api/projects`), cancel, progress/ETA, STT chain & breaker & cost caps, vision parsing,
  timeline math, caption grouping/re-timing/ASS, rhythm engine, ops, QA checks & repair mapping, no-local-models policy.
- **Fixture generator** `server/scripts/video_edit_fixtures.js`: synthetic talking heads whose speech is synthesized through
  the app's existing KIE/OpenRouter TTS (`services/tts.js synthesize`, one clip per phrase/filler so silence and filler timings
  are exact), injected fillers/pauses/repeats, 8 languages, poor-audio variant (seeded noise + low gain), vertical/horizontal,
  20/30/60 s, animated portrait visuals (moving person, scene cuts), rotation/VFR container variants, exact `truth.json`;
  generated once and cached (`manifest.lock.json`), so test runs are offline and free.
- **Fault injection** `VIDEO_EDIT_FAULTS` / per-project `debugFaults` (dev only): provider 402/429/timeout/stall/bad JSON,
  assets http500/empty, render exit/hang/segment, crash at stage, disk full.
- **E2E harness** `server/scripts/video_edit_e2e.js` against the running dev server (suites quick/full/faults and opt-in
  `--live-providers --max-usd`): upload → SSE stages → plan → replace one B-roll (asserts 0 analysis re-runs, 0 new STT/LLM calls,
  segment cache hits) → export → ffprobe/loudness/caption/face assertions → cross-user 404 → delete leaves nothing.
- **Acceptance matrix** covers all 20 required scenarios (20 s talking head … rendering failure) plus crash-resume, small edit,
  security; universal criteria: COMPLETED, dims/fps exact, duration ±2 frames, −14 ± 1.5 LU, true peak ≤ −1 dBTP, 0 clipped words,
  cost ≤ cap.
- **Template regression**: `scripts/run-regression.js --save` before any change, `--check` after (23 existing npm test/check
  scripts: pass→fail flips fail), web lint errors ≤ baseline 6, smoke `/api/projects` job reaches `done`, `/api/generate` 202.
- **Real run in the browser** via the Vite dev server + backend: full upload → edit → export on a 20–30 s clip.

## Prerequisites / user actions
- `OPENROUTER_API_KEY` and `KIE_API_KEY` present (already used by the app). A working **Pexels** (`PEXELS_API_KEY`) or **Pixabay**
  key unlocks stock *video* B-roll; without it B-roll degrades to images with Ken Burns or none.
- `SECRET_KEY` must be set in production (auth); set `WEB_ORIGIN` for split deploys.
- Deploy: nginx `location /api/video-edits/` with `client_max_body_size 520M`, `proxy_request_buffering off`,
  `proxy_read_timeout 3600s` (EB `proxy.conf` 1M limit must be raised); Dockerfile unchanged.

## How the build will be executed
- Phases 2–10 run as sequential multi-agent workflows (one per phase), each: design-contract check → parallel implementation
  agents on **disjoint new files** in the main working copy (no git worktrees — HEAD can't boot) → integration agent →
  tests on real fixtures → adversarial review → fixes. I review results between phases before starting the next.
- Phase 2 first writes the contracts (`docs/ai-video-edit/ARCHITECTURE.md`, `EDIT_PLAN.md`, `API.md`, `QA.md`) from this plan so
  every agent codes against the same schema/API.
- Before any commit/PR: `code-review-graph build` + review; conventional commits; commits only when you ask.
