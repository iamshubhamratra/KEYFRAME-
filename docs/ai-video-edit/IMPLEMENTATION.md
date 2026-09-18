# AI Video Edit — implementation status, architecture as built, decisions

Companion to the design contracts in this folder (`ARCHITECTURE.md`, `EDIT_PLAN.md`, `ENGINE.md`, `RENDER.md`,
`ANALYSIS.md`, `API.md`, `UX.md`). Where this file and a contract disagree, this file describes the code.

## 1. The mode

`AI_VIDEO_EDIT` is a separate subsystem (`server/src/video_edit/**`, `web/src/screens/aiEdit/**`). The template
flow (`TEMPLATE_GENERATION`: prompt → brief → script → scenes → HyperFrames → MP4) is untouched; the two share only
services (OpenRouter/KIE clients, stock providers, `audio_mix`, SFX library, brand kit, HyperFrames CLI, fonts).

```
upload ─► VALIDATING ─► COMPRESSING ─┬► EXTRACTING_AUDIO ─► TRANSCRIBING ─► ANALYZING_CONTENT ─► SEARCHING_BROLL ─► SCORING_ASSETS ─┐
         (admission,     (mezzanine,  └► ANALYZING_VIDEO (scdet/black/freeze + vision face track) ───────────────────────────────┴► BUILDING_EDIT_PLAN
          strict probe)   proxy, wavs)                                                                                                 (director / heuristic
                                                                                                                                        → rhythm → materialize
                                                                                                                                        → revision 1)
 ─► PREPARING_RENDER ─► RENDERING ─► POST_PROCESSING ─► QUALITY_CHECK (+ repair laps) ─► READY: editor opens on the first preview
    (automatic first preview, inline in the same pipeline job; settings.autoRender)
```

Every AI call goes through OpenRouter or KIE (`ai/llm.js`, stage names `ve_*`); no local ML models (enforced by
`video_edit_policy.test.cjs`). Deterministic DSP (ffmpeg filters, RMS envelopes, libass) does everything that can be
measured.

## 2. Module map (as built)

| Area | Modules |
|---|---|
| Platform | `store.js` (project.json + revisions, statuses, fencing) · `engine/{runner,stages,queue,proc,progress}.js` · `engine/render_jobs.js` · `recovery.js` · `retention.js` · `events.js` (SSE) · `faults.js` |
| Security | `security/{owner,origin_guard,limits,media_token}.js` · `media/{admission,probe_strict,normalize}.js` |
| Analysis | `analysis/{technical,audio,transcript,faces,content,…}.js` · `analysis/stt/*` (OpenRouter → KIE → islands chain) |
| Plan | `plan/{schema,timeline,resolve,ops*,revisions,outline,replan}.js` · `director/{director,heuristic,rhythm,build_plan,framing}.js` |
| B-roll | `broll/*` (search Pexels/Pixabay/Openverse, lexical + vision judge + dhash scoring, SSRF-safe acquire, conform) |
| Captions / audio / cards | `captions/*` (grouping, placement, libass ASS, translation, SRT/VTT) · `audio/{voice,mix,music,sfx}.js` · `cards/*` (HyperFrames + ASS fallback) · `brand/brand.js` |
| **Render (phase 7)** | `render/profiles.js` · `render/compose.js` (Edit Plan → Composition, pure) · `render/materialize.js` · `render/aroll.js` · `render/composite.js` · `render/cache.js` · `render/render.js` · `render/exprs.js` |
| **QA (phase 9)** | `qa/{checks,vision,repair,verdict,common,index}.js` |
| API | `routes.js` · `editing/*` (plan, ops, undo/redo, candidates) · **`render_routes.js`** (render, renders, exports, logo, render media) · `views*.js` |

## 3. Rendering as built

`Edit Plan revision → materialize.resolveMedia → compose.buildComposition → aroll (chunks → base) → composite →
voice stem → mix → SRT/VTT, poster, credits, layout → QA`.

- **Composition** (`render/compose.js`, pure, hashed): timeline pieces are split at punch-in / zoom-emphasis / reframe
  / SPLIT edges; framing priority REFRAME > user crop (`framing.adjust`) > jump-cut alternation > segment keyframes >
  smoothed face. Zoom is capped so the 1080p export never upscales the crop more than 2×; when even the unzoomed crop
  would exceed that (a vertical take in a 16:9 output, a low-resolution take) or `output.background === 'blur'`, the
  whole frame is fitted over a blurred copy. Preview and export make the same decisions (crops are mezzanine pixels).
- **Chunk cache**: sub-pieces are grouped on an 8 s *source* grid (≤ 10 s), keyed by their own specs only, so a caption,
  B-roll, music or logo edit re-uses every A-roll chunk and a cut toggle re-encodes only the chunks around it
  (measured: 4/4 and 3/3 chunk hits on live edits, see §6).
- **Composite**: one ffmpeg pass, z-order base → B-roll/PIP → dips → cards → captions (libass) → logo; card webms are
  decoded with `libvpx-vp9` so alpha survives; the base is BT.709-tagged before RGB overlays.
- **Audio**: sample-exact voice stem from `work/voice48k.wav` (6 ms joint fades, analysis-chosen cleanup chain,
  −16 LUFS) → `audio_mix.mix` (music envelope + ducking + SFX) → true-peak post-pass. Live results −13.7 … −14.1 LUFS,
  TP −1.4 … −1.5 dBTP.
- **Failure ladder**: chunk failure → one single-threaded retry → composite failure → base + captions only
  (`RENDER_OVERLAYS_DROPPED`) → mix failure → voice only (`MUSIC_DROPPED`) → render `failed`; the plan, the cache and the
  current export are never touched. Fault tokens `render:{exit1|hang|chunk:<n>}` reach the chunk encoder.

## 4. Decisions that differ from the contracts

1. **Where assets are downloaded.** `BUILDING_EDIT_PLAN` materializes accepted B-roll, a music track (+ 2 alternatives)
   and the create-time logo *before* revision 1 is committed (soft deadline = what is left of the stage budget), so the
   editor shows real clips and "Change music" has candidates. Anything a later revision still lacks is fetched at
   render time into `assets/ledger.json` — **a render never creates a plan revision** (that would push onto the user's
   undo stack and clear redo).
2. **Automatic first preview runs inside the pipeline job** (`runner` `afterPipeline` hook), reported as the
   PREPARING_RENDER … QUALITY_CHECK stages, so the analysis screen ticks "Rolling the preview / Checking the cut" and the
   user lands in the editor with a finished preview.
3. **QA may change the plan only on the AI's own first draft.** Repair laps commit `qa-repair` revisions there; if an
   earlier lap scores better it ships and a `restore` revision puts the plan head back on it. User-requested renders get
   render-level repairs only; plan-level findings are shown in the editor's quality dialog (`GET /:id/plan` injects the
   latest findings as `plan.qa`, derived, never stored).
4. **Safe areas are one table** (`render/profiles.SAFE_AREAS`) used by card placement and `qa/checks`; cards are scaled
   and placed inside it (before this, the top region at 6 % tripped QA, whose repair then disabled the hook card).
5. **A PIP never shares the logo's corner** (it flips sides).
6. **Picture transitions use frozen handles, not overlapping clips** (2026-09-18, replaces "CROSSFADE renders as a
   dip"). The chunk/voice model never has two A-roll clips on screen at once, so `render/transitions.js` extends each side
   of a joint with a clone of its last / first frame (tpad) and runs `xfade` centred on the joint: the outgoing clip plays
   in real time up to the joint, the incoming one from it, the output keeps its exact frame count and lip-sync. See §8.
7. **QA's clipped-word check ignores slivers of removed words ≤ 100 ms.** Retake cuts keep ~60 ms before the kept word on
   purpose (STT gives a stutter and its retake touching timestamps; clipping the kept onset is worse).
8. **Client field names win**: render records are `{ renderId, planRevision, … }` everywhere (views, SSE, routes); QA is
   shown as `verdict pass|review|fail`, a 0–10 score and `counts.{fail,warn}` next to the engine's blocker/major/minor.

## 5. API added in phase 7 (see `API.md` §3 for the rest)

| Route | Answer |
|---|---|
| `POST /:id/render {kind, planRevision?, profile?}` | 202 `{renderId, queuePosition}` · 200 `{renderId, cached:true}` for an identical done render · 409 `NOT_READY` / `REVISION_CONFLICT` · 422 `INVALID_PROFILE` (preview ⇒ preview540, export ⇒ export720/1080) |
| `GET /:id/renders/:rid` | render view + `qa{verdict, score, checks[], matchesPreview}` + `files{mp4, srt, vtt, credits, poster}` (media kind/key/filename/size) + `credits[]` + `notes[]` |
| `GET /:id/exports` | `{currentId, stale, items:[{renderId, planRevision, profile, qa, checks, credits, files}]}` |
| `POST /:id/logo` (multipart `logo`, ≤ 5 MB PNG/JPEG/WebP) | re-encoded to `assets/logo.png` (metadata stripped), applied as a `branding.setLogo` revision → `{revision, hash, logo}` |
| `POST /:id/cancel {target:'render', renderId?}` | cancels a queued/running render (ffmpeg tree killed) |
| Media kinds | `preview/<rid>` · `export/<rid>` · `captions/<rid>.srt|.vtt` · `credits/<rid>` · `frame/<rid>` (poster) · `logo` — resolved from the render record, never from the URL |

A newer preview request cancels older queued/running previews; exports are never superseded. An export moves the
project READY/COMPLETED → RENDERING → COMPLETED; `exports.currentId` moves only to a render without a QA integrity
blocker.

## 6. How to test

| Tier | Command | What it proves |
|---|---|---|
| Unit + integration (offline, free) | `node server/scripts/run-video-edit-tests.js` | 40 suites incl. `video_edit_render` (real ffmpeg renders of the 45 s fixture plan: frame-exact output, loudness, chunk cache reuse, aspect change, card fallback, injected render failure, cancel, vanished asset) and `video_edit_qa*` |
| Live API E2E (billed, capped) | `node server/scripts/video_edit_e2e.js --live --edit --export [--fixture …] [--settings '{…}'] [--faults 'llm:error']` | upload → pipeline → automatic preview → a small edit (asserts zero re-analysis, reports chunk hits) → export → ffprobe/loudness/SRT → auth spot checks; JSON report |
| Live browser E2E | `node web/tests/smoke/ai-edit.live.mjs [take.mp4]` | the real App + real backend in Chrome: upload, analysis screen, editor with the preview playing, remove B-roll → Update preview, export 1080p |
| UI (fixture mode) | `node web/tests/smoke/ai-edit.smoke.mjs` | keyboard, viewports, ARIA, no network |

Prerequisites for live runs: `OPENROUTER_API_KEY` (and optionally `KIE_API_KEY`) in `server/.env`; Pexels/Pixabay keys
for stock video; the Pixabay bridge for music (`cd pixabay-no-node-modules && PORT=3007 npm start`) — without it music
falls back to a synthesized ambient pad (by design, noted in credits).

### Live acceptance results (2026-09-18, real OpenRouter/KIE/Pexels/Pixabay, i5 laptop)

| Scenario | Result |
|---|---|
| 20 s vertical EN talking head → 9:16 | READY 224 s incl. first preview; 690 frames exact; −13.7 LUFS / −1.4 dBTP; 22 SRT cues; B-roll + credits; $0.04 |
| filler words + repeats (16:9 source) | 2 fillers + 1.3 s silence removed, retakes cut; caption edit re-render 3/3 chunks cached, no re-analysis |
| vertical take → 16:9 output (+ export) | fitted over blurred fill; QA clean 100 after the fit-geometry fix (was 52: captions over the face) |
| Spanish take | es transcript, Spanish captions and cards ("Un truco muy sencillo"); edit 2/2 chunks cached |
| LLM down (`llm:error`) | content + B-roll judge fall back to deterministic / lexical with notices; edit ships |
| stock APIs down (`assets:http500`) | images → none; `NO_BROLL_FOUND` notice; edit ships, QA 7.6 |
| STT primary + KIE down | island transcription, `timing: approx`, proportional captions, QA 8.8 |
| all STT down | NEEDS_ATTENTION `STT_FAILED` with "continue without transcript" → retry → READY (music, cuts, no captions) |
| browser (real App + backend) | upload → analysis → editor with preview playing → remove B-roll → Update preview (r1 → r4) → export 1080p → downloads; 0 console errors |
| offline render suite | frame-exact renders, cache reuse, aspect change, card fallback, injected render failure, cancel, vanished asset |

Independent review (2026-09-18) fixes: pending (user-picked, not yet downloaded) B-roll now renders; record trimming never
evicts the current export/history and prunes evicted files; hidden QA laps never answer requests or list as exports;
concurrent identical requests share one render; renders of one project are serialized; cancelled/failed laps and inline
renders never stay `running` (pipeline stages closed too); QA-lap progress stays inside QUALITY_CHECK; restore when the
head sits on an unshipped repair; NEEDS_ATTENTION (QA_INTEGRITY) → export retry path; retention/deletion treat renders as
busy and wait for them; logos content-addressed with a forced demuxer and status-gated upload; zoom-emphasis continuous
across sub-pieces; SPLIT in 1:1 renders FULL (noted).

## 8. Transitions, looks and face-aware titles (2026-09-18)

| What | Where | Notes |
|---|---|---|
| **Transitions between cuts** — `settings.cutTransition` = auto · smooth · zoom · whip · slide · blur · flash · none | `render/transitions.js` (plan + xfade graph), `render/composite.js` (applied to the base before B-roll, cards, captions) | Absent = `auto`: a 5-frame crossfade inside a sentence, a zoom punch / whip / slide / crossfade where a new sentence starts (≤ 1 per 3 s, ≤ 2 per 10 s). Joints under full-screen B-roll get none. Level COMPOSITE (no A-roll re-encode). |
| **Transition kinds** | `plan/schema.js` ENUMS.transitionKind | + ZOOM_IN (face-centred scale punch + crossfade), WHIP_LEFT/RIGHT (slide + directional motion blur), SLIDE_UP, BLUR, CIRCLE_OPEN, PIXELATE; CROSSFADE is now a real crossfade. Duration ≤ 0.8 s. The director may pick them at topic changes. |
| **Whoosh under strong transitions** | `render/compose.js` buildAudio, `render/materialize.js` (`media.transitionSfx`) | vol 0.22, leads the window by 60 ms, never stacked within 0.4 s of a planned SFX; off with SFX. |
| **Looks** — `settings.look` = natural · warm · cool · vivid · cinematic · mono · vintage | `render/looks.js`, composite (after B-roll, before cards/captions/logo) | Blacks stay black; text and brand colours are never graded. |
| **Face-aware title placement** | `render/compose.js` placeCard / cardInk / faceOutAt | Cards are placed by their LETTERS (ink box), moved vertically clear of the tracked face (over every frame they are up) and of captions, inside the safe area. The layout reports the ink box; QA `CARD_COVERS_FACE` flags what is left. |
| **Renderer version** | `render/render.js` RENDERER_VERSION, `engine/render_jobs.js` | A render from an older renderer is not reused for the same plan; opening an edit whose preview is outdated queues a fresh preview. |

## 7. Known limitations

- Face tracking returns `assumed` for extreme close-ups where the vision model boxes the whole frame; framing is then a
  centred crop and captions cannot avoid the face (QA reports it honestly).
- Music quality depends on the Pixabay bridge being up; the fallback is a generated pad.
- HyperFrames cards cost ~15 s each warm (~65 s cold Chrome) on export; previews always use the ASS fallback.
- Vision QA samples ≤ 8 frames per lap; it is advisory (class Q), never an integrity blocker.
