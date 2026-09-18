# AI Video Edit — Engine contract (store · security · jobs · failures · QA · faults · tests)

Status: implementation contract. Companion docs: `ARCHITECTURE.md`, `API.md`, `EDIT_PLAN.md`.
House rules that apply everywhere: additive only (never edit shared template-flow modules except the listed hooks), fail-open for
enhancements, loud failure for missing transcripts, no local ML models (OpenRouter/KIE only), no transcript text or filenames in logs.

## 1. Module layout (`server/src/video_edit/`)
```
index.js                buildRouter(deps), start() -> stop()
settings.js             resolved config: defaults + config.videoEdit + VIDEO_EDIT_* env; validateWhenPresent(); paths; limits; feature flags
settings_schema.js      zod Settings + DEFAULT_SETTINGS (API.md §7)
ids.js                  newProjectId() "ve_"+16 [0-9a-z]; newId(prefix) prefix+"_"+nanoid8; newRunId(); newRenderId()
fsx.js                  writeJsonAtomic, readJsonSafe (+.bak), resolveInside(root, rel), moveToTrash, rmWithRetry, dirSizeBytes, statfsFreeMb
store.js                projects index + project.json CRUD, TRANSITIONS, setStatus, mutex, runId fencing, revisions I/O, list/filters
recovery.js             boot recovery (§3.6)
retention.js            periodic sweeper (§4.12)
events.js               per-project event bus (SSE fan-out, seq) + logs/events.jsonl writer (5 MB cap, rotate once)
faults.js               fault-token parser + maybeFail(point, ctx) (§8)
cost.js                 estimates, ledger, caps, checkBudget integration
providers/breaker.js    process-wide circuit breaker per provider
security/origin_guard.js · security/owner.js (requireEditUser, loadOwnedProject) · security/limits.js · security/media_token.js
media/admission.js      multer storage engine to _staging (hash + byte cap), magic-byte sniff, admission pipeline
media/probe_strict.js   ffprobe with protocol whitelist + forced demuxer + zod + policy
media/normalize.js      mezzanine + proxy + wavs + poster; decode-sample check
engine/proc.js          runFfmpeg/runFfprobe(args,{cwd,timeoutMs,signal,onProgress,stallMs}) via spawn_compat + killTree; pid registry
engine/progress.js      ffmpeg -progress parser; stage weights; EWMA ETA (_metrics/stage-rates.json)
engine/queue.js         PQueue({concurrency}) + heavy-CPU slot semaphore shared with template jobs (reads db.activeCount())
engine/stages.js        STAGE graph, handler registry, checkpoint runner (inputHash, skip, attempts, budgets)
engine/runner.js        runPipeline(projectId,{resume}), runRender(projectId,renderId), cancel registry
routes.js               Express router (API.md)
ai/llm.js · ai/kie_jobs.js · analysis/* · plan/* · director/* · broll/* · captions/* · audio/* · brand/* · cards/* · render/* · qa/*   (later phases)
```
Also `server/src/services/generation_mode.js`: `module.exports = Object.freeze({ GENERATION_MODES: Object.freeze({ TEMPLATE_GENERATION:"TEMPLATE_GENERATION", AI_VIDEO_EDIT:"AI_VIDEO_EDIT" }), modeOfJob(job) })` — template jobs → TEMPLATE_GENERATION.

## 2. Settings (`settings.js`)
Reads `config.videoEdit` (may be absent — config.js is NOT modified; the top-level freeze passes nested objects through) and env:
```
enabled (true) · dir ("edits", resolved against config.paths.root; refuse + disable if inside jobsDir/uploadsDir/root/public)
indexFile ("video-edits.json" in config.paths.root) · concurrency (1) · heavySlots ("auto" = max(1, floor(cpus/2)))
limits (API.md §8) · retention {projectTtlDays:30, idleIntermediatesHours:72, originalDeleteDays:7, failedKeepDays:7}
providers { stt:{ order:["openrouter","kie","islands"], openrouterModel, kieModel:"elevenlabs/speech-to-text", islandsModel,
            chunkTargetSec:45, chunkMaxSec:55, maxChunkBytes:8e6, concurrency:2, kieStallSec:90 },
            vision:{ model, framesPerCall:8, maxFaceFrames:24 }, llm:{ stageModels: {ve_content, ve_director, ve_broll_judge, ve_qa} } }
caps { maxUsdPerProject:0.50, dailyUsdCap:5.00, minBudgetRemaining:0.15 }
faults { allow:false }   // VIDEO_EDIT_FAULTS_ALLOW=1 or NODE_ENV!=="production"
providerBaseOverride     // VIDEO_EDIT_OPENROUTER_BASE / VIDEO_EDIT_KIE_BASE — honoured only outside production (tests)
```
Env overrides: `VIDEO_EDIT_ENABLED`, `VIDEO_EDIT_DIR`, `VIDEO_EDIT_INDEX`, `VIDEO_EDIT_MAX_UPLOAD_MB`, `VIDEO_EDIT_MAX_DURATION_SEC`,
`VIDEO_EDIT_CONCURRENCY`, `VIDEO_EDIT_FAULTS`, `VIDEO_EDIT_FAULTS_ALLOW`, `VIDEO_EDIT_STT_MODEL`, `VIDEO_EDIT_VISION_MODEL`.
Validation only for values present; invalid values → feature disabled with a logged reason (never crash boot).

## 3. Store
### 3.1 Disk layout
```
<root>/video-edits.json                  index (cache; rebuildable)
<dir>/_staging/<nanoid>.upload           swept >1 h
<dir>/_trash/<id>.<ts>/                  deletion in progress
<dir>/_shared/asset-search/<sha1>.json   24 h stock search cache
<dir>/_metrics/stage-rates.json          ETA EWMA
<dir>/_runtime/pids.json                 live ffmpeg/ffprobe pids (for boot kill)
<dir>/ve_<16>/
  project.json(.bak)
  source/original.bin  source/probe.json            never served; original deleted 7 d after mezzanine verified
  work/mezz.mp4 work/proxy540.mp4 work/audio16k.wav work/voice48k.wav work/poster.jpg work/chunks/ work/frames/
  analysis/{technical,audio,vad,transcript.words,transcript,video,faces,content}.json  analysis/stt/chunk-<n>.json  analysis/llm-cache/<sha>.json
  assets/broll/ assets/music/ assets/sfx/ assets/logo.png  broll/candidates/<itemId>.json
  plan/revisions/r000001.json …          immutable (sha256 of canonical JSON)
  render/cache/{aroll,base,voice,ass,composite}/  render/cards/<cardHash>/  render/layout/<renderId>.json  render/out/<renderId>.{mp4,srt,vtt,jpg} credits.txt
  qa/<renderId>/lap<n>/{checks.json,verdict.json,frames/}
  fonts/  logs/events.jsonl  fallbacks.json
```
### 3.2 `project.json`
```jsonc
{ "schemaVersion":1, "id":"ve_…", "mode":"AI_VIDEO_EDIT", "ownerId":"<uuid>", "clientRequestId":"…",
  "status":"PROCESSING", "statusReason":null,            // {code,message,retryable,stage,actions[]}
  "createdAt":0, "updatedAt":0, "lastOpenedAt":0, "runId":"run_…",
  "progress":{"stage":"TRANSCRIBING","stagePct":42,"overallPct":31,"message":"…","stageStartedAt":0,"etaSec":95,"queuePosition":null},
  "title":"…", "consent":{"thirdPartyAi":true,"termsVersion":"2026-09","at":0},
  "source":{"displayName":"…","sizeBytes":0,"sha256":"…","demuxer":"mov","durationSec":31.2,
    "video":{"codec":"hevc","width":1920,"height":1080,"displayWidth":1080,"displayHeight":1920,"rotation":90,"fps":29.97,"vfr":false,"interlaced":false,"hdr":false,"bitrateKbps":0},
    "audio":{"codec":"aac","channels":2,"sampleRate":48000},"ignoredStreams":[{"type":"data","codec":"tmcd"}],
    "mezzanine":{"path":"work/mezz.mp4","sha256":"…","width":1080,"height":1920,"fps":30},"originalDeleteAfter":0},
  "settings":{}, "settingsHash":"…",
  "stages":{"<STAGE>":{"status":"pending|running|done|failed|skipped|interrupted","stageVersion":1,"inputHash":"…",
     "outputs":{"<name>":{"path":"…","sha256":"…","size":0}},"engine":"…","attempts":0,"startedAt":0,"finishedAt":0,
     "durationMs":0,"fallbacks":[],"error":null,"costUsd":0,"providerTasks":[{"provider":"kie","taskId":"…","chunk":3,"createdAt":0}]}},
  "discoveries":{},
  "plan":{"headRevision":0,"headHash":null,"undo":[],"redo":[],"revisions":[{"rev":1,"hash":"…","parent":null,"author":"director","opsCount":0,"summary":"…","createdAt":0}]},
  "renders":[{"id":"rd_…","kind":"preview|export","planRev":3,"planHash":"…","profile":"preview540","compositionHash":"…",
     "status":"queued|running|done|failed|cancelled|interrupted","runId":"…","segments":{"total":0,"cacheHits":0},
     "file":"render/out/rd_….mp4","sha256":"…","qa":{"verdict":"review","score":78,"shippedLap":1,"unverified":false},"error":null,"createdAt":0}],
  "exports":{"currentId":null,"stale":false,"history":[]},
  "qaSummary":null, "notices":[], "errors":[],             // errors: ring of 20 {at,stage,code,class,message,detail≤500}
  "cost":{"estimateUsd":0,"capUsd":0.5,"spentUsd":0,"byStage":{}}, "usage":{},   // usage = UsageTracker.computeCosts()
  "recovery":{"count":0,"lastAt":0}, "storage":{"bytes":0}, "retention":{"deleteAfter":0}, "debugFaults":null }
```
### 3.3 Statuses and TRANSITIONS (`store.setStatus(id, next, {actor})`, illegal → `ILLEGAL_TRANSITION`)
```
QUEUED:          PROCESSING, CANCELLED, DELETING
PROCESSING:      READY, RENDERING, NEEDS_ATTENTION, FAILED, CANCELLED, QUEUED(actor recovery), DELETING
READY:           RENDERING, QUEUED(retry|reanalyze), DELETING
RENDERING:       COMPLETED, READY(render failed|cancelled), NEEDS_ATTENTION, DELETING
COMPLETED:       READY(plan edited → exports.stale), RENDERING, QUEUED, DELETING
NEEDS_ATTENTION: QUEUED, READY, DELETING
CANCELLED:       QUEUED, DELETING
FAILED:          DELETING            (input-class only)
DELETING:        —
```
User-facing stage names live in `progress.stage` only: UPLOAD (client), VALIDATING, COMPRESSING, EXTRACTING_AUDIO,
TRANSCRIBING, ANALYZING_VIDEO, ANALYZING_CONTENT, SEARCHING_BROLL, SCORING_ASSETS, BUILDING_EDIT_PLAN, PREPARING_RENDER,
RENDERING, POST_PROCESSING, QUALITY_CHECK, COMPLETED.
### 3.4 Writes and invariants
`fsx.writeJsonAtomic(file, obj, {backup})`: write `file.<pid>.<seq>.tmp` (flag `wx`) → `fsync` → close → (backup: copy current to
`.bak`, only on status/plan-head changes) → `rename` with EPERM/EBUSY/EACCES retry ×5 (25→400 ms); still failing → keep dirty in
memory, retry next tick, log `ALERT store-write`. Load: `project.json` → `.bak` → `NEEDS_ATTENTION STORE_CORRUPT` (never delete).
Progress kept in memory, persisted ≤1/s. Index: written after project.json; flushed synchronously when status enters/leaves
QUEUED/PROCESSING/RENDERING, otherwise debounced 250 ms; rebuilt at boot if missing/corrupt/mismatched.
**Invariants:** I1 project.json only atomic · I2 revisions immutable, head moves only in project.json · I3 exports immutable,
`exports.currentId` never points at a render with an integrity blocker · I4 stage outputs written as `*.tmp.<runId>.*` then
renamed, checkpoint recorded after rename + hash · I5 writes carrying a stale `runId` rejected · I6 retention never deletes source,
mezzanine, plan or current export of a live project.
### 3.5 Concurrency
Per-project async mutex for every mutation. Ops: `expectedRevision` + `batchId` (last 50 deduped). Renders snapshot
`{planRev, planHash}`; ops allowed during render → result marked `exports.stale` if head moved. QA-repair revisions only when
head === render's `planRev`. Undo/redo create new revisions.
### 3.6 Boot recovery (`recovery.js`, from `start()`; never touches `db.takeOrphanedTasks()`)
1. mkdir dirs; verify dir placement (§2). 2. load/rebuild index; `ve_*` dirs without project.json older than 1 h → `_trash`.
3. kill pids from `_runtime/pids.json` only if alive and image is ffmpeg/ffprobe (`tasklist /FI "PID eq n"` on win32, `/proc/n/comm` on Linux).
4. per project: DELETING → resume deletion; QUEUED → enqueue; PROCESSING/RENDERING → delete `*.tmp.*`, mark running stage/render
   `interrupted`; crash-loop guard (`recovery.count ≥ 8`, or count>0 and last <25 s ago → `NEEDS_ATTENTION RESTART_LOOP`, retryable);
   else PROCESSING → QUEUED (resume) and RENDERING → READY/COMPLETED with the render re-queued on the same planRev.
5. KIE `providerTasks` younger than 1 h are re-polled, never re-created. 6. sweep `_staging` >1 h; start retention every 10 min.
### 3.7 dev-watch (additive, `server/scripts/dev-watch.js`)
```js
const EDITS_INDEX = path.join(ROOT, "video-edits.json");
const EDIT_ACTIVE = new Set(["QUEUED", "PROCESSING", "RENDERING"]);
function activeEditCount() { try { return Object.values(JSON.parse(fs.readFileSync(EDITS_INDEX, "utf8")).projects || {})
  .filter((p) => p && EDIT_ACTIVE.has(p.status)).length; } catch { return 0; } }
// in restart(): const active = activeJobCount() + activeEditCount();
```

## 4. Media security (admission pipeline, `media/admission.js`)
1. Before body: `Content-Length` > limit + 1 MB → 413; `statfs(dir)` free < 4×CL + 1 GB → 507; quota → 429.
2. Custom multer storage (`_handleFile/_removeFile`) → `_staging/<nanoid>.upload`; sha256 + byte count while streaming; abort past
   limit; client filename/extension never used in paths; every rejection deletes staged files.
3. Magic bytes (first 64): ISO-BMFF `buf[4..8] ∈ {ftyp,moov,mdat,wide,free,skip,pnot}` with image brands (`heic,heix,mif1,msf1,avif`)
   rejected → demuxer `mov`; EBML `1A45DFA3` → `matroska`; else 415 (covers `#EXTM3U`, `ffconcat`, `<?xml`, RIFF, TS, empty).
4. Strict probe (`probe_strict.js`, NOT `video_probe.probeVideo`): `ffprobe -v error -protocol_whitelist file -f <demuxer>
   -probesize 32M -analyzeduration 30M -show_format -show_streams -show_error -of json file:<abs>`; 20 s timeout + killTree;
   stdout cap 2 MB; zod; policy per API.md §8; rotation from `side_data_list` displaymatrix; `field_order` interlace; HDR from
   `color_transfer ∈ {smpte2084, arib-std-b67}`; VFR when `r_frame_rate` vs `avg_frame_rate` differ >1 %; duration 0 → count
   packets else reject; `tags` never stored.
5. Decode samples at 0, mid, end−1 s: `ffmpeg -nostdin -v error -xerror -protocol_whitelist file -f <d> -ss T -i file:<src> -t 0.5
   -map 0:v:0 -map 0:a:0 -f null -` (20 s each) → `UNDECODABLE`.
6. Create project, rename staging → `ve_<id>/source/original.bin`; `displayName` = basename, NFC, strip control + bidi
   (U+202A–202E, U+2066–2069), ≤80 chars.
7. Normalize (COMPRESSING): `ffmpeg -nostdin -protocol_whitelist file -f <d> -i file:source/original.bin -map 0:v:0 -map 0:a:0 -dn -sn
   -map_metadata -1 -map_chapters -1 -vf "scale=<≤1920 long edge, even>,setsar=1[,yadif][,zscale tonemap],fps=30,format=yuv420p"
   -fps_mode cfr -c:v libx264 -preset veryfast -crf 18 -g 30 -c:a aac -ar 48000 -ac 2 -af aresample=async=1:first_pts=0
   -movflags +faststart -progress pipe:1 work/mezz.mp4.tmp.<runId>.mp4` then rename; proxy540 (ultrafast crf 26, g 15);
   `voice48k.wav` (pcm_s16le 48 kHz mono), `audio16k.wav` (pcm_s16le 16 kHz mono), `poster.jpg`. Stream-copy video path allowed
   when h264 + CFR 30 + SDR + ≤1920 + unrotated (still re-mux audio + strip metadata).
8. All later ffmpeg calls: `-protocol_whitelist file`, forced demuxer, `file:` paths, generated concat lists, killTree on abort,
   `os.setPriority(pid, 10)`, `-threads` capped, `-/filter_complex <file>` script files for long graphs (Windows 32k command limit;
   `-filter_complex_script` is deprecated on ffmpeg 8 and bit-identical — spike S7). Seek/trim seconds are always derived from frame
   indices and printed with ≥ 6 decimals (spike S2: 3 decimals dropped frames).
9. Stock media untrusted: `asset_sources/util.validateMedia/validateClip` + `video_probe.gradeClip`, then re-encoded.
10. `fsx.resolveInside(root, rel)`: reject NUL, absolute, `..`; `realpath` prefix check (case-insensitive on win32); `lstat` rejects symlinks.
11. Temp: `*.tmp.<runId>.*` removed in `finally` and at boot; `_staging` >1 h swept; `work/frames`, `qa/*/frames` purged 24 h after idle.
12. Retention: FAILED(input) → delete source+work now, keep project.json 7 d · NEEDS_ATTENTION/CANCELLED → 7 d full, then purge caches,
    delete at 30 d · READY/COMPLETED → intermediates purged 72 h after last open, project deleted at 30 d · owner missing → delete after
    7 d only if auth store readable · disk below floor → purge idle intermediates oldest first.
13. Delete: persist DELETING → abort run + killTree + stop KIE polling → destroy open media streams → remove from index (sync) →
    rename dir to `_trash` → `rm` with EBUSY/EPERM retries up to 24 h. Caches live inside the project dir and go with it.
14. Data to AI providers: audio only as ≤55 s MP3 16 kHz mono chunks; images ≤640 px JPEG, ≤8 per call, ≤1.5 MB base64 total;
    transcript text; never video. `ai/llm_guard.js` enforces. Consent stored; `privacy.allowCloudVision:false` → zero image parts.

## 5. Job engine
### 5.1 Graph
```
VALIDATING → COMPRESSING ─┬→ EXTRACTING_AUDIO → TRANSCRIBING → ANALYZING_CONTENT → SEARCHING_BROLL → SCORING_ASSETS ─┐
                          └→ ANALYZING_VIDEO ────────────────────────────────────────────────────────────────────────┴→ BUILDING_EDIT_PLAN
→ READY (autoRender) → PREPARING_RENDER → RENDERING → POST_PROCESSING → QUALITY_CHECK → COMPLETED
```
Handler contract (`engine/stages.js`):
```js
registerStage({ name, version, deps: [stageNames], heavy: bool, weight: number,
  inputHash: (ctx) => string,                 // sha of upstream output shas + relevant settings + model ids + promptVersion
  budgetMs: (ctx) => number,
  run: async (ctx) => ({ outputs: {name:{path}}, engine?, fallbacks?: [], discoveries?: {}, notices?: [], costUsd? }) })
ctx = { project, projectDir, settings, runId, signal, log, emit(event), progress(pct, message), tracker, faults, abs(rel), readJson(rel), writeJson(rel,obj) }
```
Runner: stage skipped when `status==='done' && inputHash matches && outputs exist (size + sha for JSON, size + first/last 1 MB sha for media)`;
≤3 automatic attempts for `transient` errors; throws of class `input` → FAILED; `provider|resource|config|budget` → NEEDS_ATTENTION
with `statusReason.actions`; unregistered downstream stages (early phases) → project READY with notice `PIPELINE_PARTIAL`.
Errors are normalized as `EditError(code, {class, retryable, stage, detail, userMessage})`.
### 5.2 Budgets (`D` source s, `O` output s, `px=max(1, pixels/2.07e6)`, `cf=max(0.5, 4/cpus)`, `k` = `VIDEO_EDIT_BUDGET_SCALE` default 1)
VALIDATING `min(120, 15+0.2D)` · COMPRESSING `max(120, 3·D·px·cf)` · EXTRACTING_AUDIO `30+0.5D` · TRANSCRIBING `120+4D` ·
ANALYZING_VIDEO `60+1.5D·cf` + 90 s/vision call · ANALYZING_CONTENT / BUILDING_EDIT_PLAN 120 s/attempt ×2 · SEARCHING_BROLL 20 s/query ≤8 ·
SCORING_ASSETS 60 s + 90 s/judge call · PREPARING_RENDER `60+45·cards` · RENDERING `max(300, 8·O·px·cf)` · POST_PROCESSING `60+1.5O` ·
QUALITY_CHECK `60+O` + 90 s/vision call. Every ffmpeg child also has a stall watchdog (no `-progress` update for 60 s → killTree).
### 5.3 Queue and CPU sharing
`engine/queue.js`: `PQueue({concurrency: settings.concurrency})`, renders priority 1, pipelines 0; per user 1 running + 2 queued.
Heavy stages (COMPRESSING, ffmpeg part of ANALYZING_VIDEO, RENDERING, POST_PROCESSING, QA ffmpeg scans) acquire a slot:
wait while `db.activeCount() + heavyRunning >= heavySlots` (read-only use of `server/src/models/job.js activeCount`), message "Waiting for
render capacity"; after 600 s run anyway with `os.setPriority(pid, 10)` and `-threads 2`. Network stages need no slot.
### 5.4 Progress / ETA
ffmpeg `-progress pipe:1 -nostats -stats_period 0.5` parsed (`out_time_us`, fallback `out_time_ms` which is also µs) / expected duration;
TRANSCRIBING `(chunksDone + inflightFraction)/total`; weights VALIDATING 2, COMPRESSING 12, EXTRACTING_AUDIO 3, TRANSCRIBING 18,
ANALYZING_VIDEO 8, ANALYZING_CONTENT 6, SEARCHING_BROLL 5, SCORING_ASSETS 6, BUILDING_EDIT_PLAN 8, PREPARING_RENDER 5, RENDERING 17,
POST_PROCESSING 5, QUALITY_CHECK 5 (sum 100). ETA per stage `(a + b·D·px·cf)·ratio` with EWMA ratio (α .3) in
`_metrics/stage-rates.json`; current stage blends 50/50 with `elapsed·(1−pct)/pct` once pct > 5 %; queue wait adds ETAs ahead.
### 5.5 Cancellation
Registry `Map<projectId, {ac, runId, children:Set, pendingKieTasks:Set}>`. Cancel → `ac.abort()` → killTree every child, abort fetch /
`openrouter.chat` signals, stop KIE polling; queued job returns immediately; pipeline → CANCELLED (checkpoints kept); render → render
`cancelled`, project READY/COMPLETED, export untouched; 10 s hard deadline then status forced and late writes fenced by runId.
### 5.6 Idempotency
create: (userId, clientRequestId) 24 h · ops: batchId · render: (planHash, kind, profile) · paid responses cached by content hash
(`analysis/stt/chunk-<n>.json`, `analysis/llm-cache/<sha(model|promptVersion|input)>.json`) · KIE taskId persisted before polling.

## 6. Failure matrix
| Stage | Failure | Behaviour | User message | Retry | Kept |
|---|---|---|---|---|---|
| UPLOAD | abort / too large / disk low / quota | staging removed; 413/507/429 | specific | re-upload (same clientRequestId) | — |
| Admission | bad magic / probe fail / policy / decode fail | 415/422 with reason, no project | "Not a supported video: <reason>" | new file | — |
| VALIDATING | deep damage | FAILED(input) | "Video damaged at 0:42" | no | project.json 7 d |
| COMPRESSING | ffmpeg error | 1 retry (`-fflags +genpts -err_detect ignore_err`); decode → FAILED; timeout/ENOSPC → NEEDS_ATTENTION + sweep | "Couldn't process" / "Storage full" | resume | source |
| EXTRACTING_AUDIO | silent track (speech <2 % of duration) | NEEDS_ATTENTION `NO_SPEECH` | "No speech detected" | continue without transcript | mezz |
| TRANSCRIBING | OpenRouter 429/5xx/timeout | backoff (honour Retry-After ≤60 s) → KIE for that chunk | — (fallback noted) | auto | chunks done |
| TRANSCRIBING | OpenRouter 402 / daily cap / checkBudget <0.15 | breaker open (until UTC midnight or 60 min) → KIE | — | auto | same |
| TRANSCRIBING | 401/403/model missing | breaker open (config, 1 h) + health alert → KIE | — | auto | same |
| TRANSCRIBING | KIE upload/createTask fail, `fail` state, stall >90 s, cap | → islands chat | — | auto | taskId |
| TRANSCRIBING | invalid words (non-monotonic, <60 % VAD coverage) | treated as provider failure → next | — | auto | same |
| TRANSCRIBING | every provider fails / cost cap | NEEDS_ATTENTION `STT_FAILED` / `COST_CAP_REACHED` | "Transcription services unavailable; upload saved" | retry missing chunks · continue without captions | wavs, chunks |
| TRANSCRIBING | only islands succeeded | continue, `timing:'approx'`, wider padding | notice `TIMING_APPROX` | retry later | same |
| TRANSCRIBING | fillers dropped | disfluency pass; failure → lexicon-only | notice `FILLERS_LIMITED` | — | same |
| ANALYZING_VIDEO | vision 429/402/timeout/bad JSON/no consent | `faceTrack:"assumed"` | report disclosure | — | ffmpeg analysis |
| ANALYZING_CONTENT | LLM fail / budget | deterministic analysis | "AI analysis unavailable; basic edit" | reanalyze | all |
| SEARCHING_BROLL | stock error / key rejected / empty | next provider → Openverse images → none (`NO_BROLL_FOUND`) | "Edit uses your footage only" | per-item search | all |
| SCORING_ASSETS | judge fails / budget | lexical + technical only (`judge:'unavailable'`) | — | — | all |
| BUILDING_EDIT_PLAN | LLM fail / zod invalid after repair | heuristic director (`createdBy:'heuristic'`) | "Simple edit created" | "Regenerate with AI" | analysis |
| PREPARING_RENDER | missing asset / card fail | next candidate or remove; ASS card fallback or remove | minor notice | — | plan |
| RENDERING | chunk fail / timeout | retry `-threads 1 -preset ultrafast` → drop overlays → render failed; project READY (NEEDS_ATTENTION if first) | "Render failed; edit saved" | re-render (cache) | plan, cache, previous export |
| POST_PROCESSING | loudnorm / music / mux fail | single-pass gain / skip music / retry mux once | minor | — | render |
| QUALITY_CHECK | vision fail / budget | deterministic only (`visionUnverified`) | — | — | render |
| QUALITY_CHECK | integrity blocker after laps | export not promoted; NEEDS_ATTENTION `QA_INTEGRITY` | "Export failed checks" | retry | all |
| Any | restart loop / store write / disk full / daily $ cap | NEEDS_ATTENTION with code | specific | resume | all |

## 7. QA + auto-repair (`qa/*`)
Renderer writes `render/layout/<renderId>.json`: `{elements:[{id, kind, outIn, outOut, box:{x,y,w,h}}], crops:[{pieceId, outIn, outOut, x,y,w,h, faceBox?}]}`.
Any frame extracted to judge colour (vision QA frames, poster, brand-colour checks) must decode as BT.709 (`-vf scale=in_color_matrix=bt709`
or tagged input; spike S3: untagged decodes shift brand colours by ΔE ≈ 5). The true-peak check relies on the RENDER.md §8 limiter
post-pass (`audio_mix.mix` alone measured TP −0.5…0.0 dBTP — spike S7), and loudness values must be re-measured after that pass
(mix()'s own report is stale when its gain step fires).
Class **I** = integrity (blocks promotion), **Q** = quality.
**Deterministic checks:** container decodable, h264 yuv420p, SAR 1, dims/fps exact (blocker I) · duration vs plan ±2 frames ok,
≤0.5 s major (repair remux trim), more blocker I · audio present & I > −40 LUFS (blocker I); −14 ±1.5 LU, TP ≤ −1 dBTP via
`ebur128=peak=true` (major) · unplanned silence (`silencedetect=n=-50dB:d=2`, excluding planned pauses) major · black
(`blackdetect=d=0.25:pix_th=0.10`, excluding fades) >1 s blocker I else major · A-roll freeze (`freezedetect=n=-60dB:d=1.5`, excluding
cards/stills/FREEZE effects) >2 s blocker I · cut inside a word (30 ms margin; 120 ms approx) blocker Q · kept piece <0.6 s (0.35 s
jump-cut style) major · caption timing lead ≤0.25 s / lag ≤0.10 s (±0.25 approx), end ≥ last word end −0.05, no overlaps, cue
≥0.5 s (major) · coverage ≥98 % kept non-filler words; removed fillers never shown · reading speed ≤20 chars/s (≤15 hi/ar, ≤8 ja),
≤2 lines (minor) · safe areas (9:16 top 12 % / bottom 20 % / sides 6 %; 16:9 5 %) major · caption ∩ face >10 % of cue major
(minor if face assumed) · face inside crop ≥95 % of samples major · overlaps (space & time >0.1 s) major · B-roll coverage ≤60 %,
face covered ≤50 % of speech, speaker visible first 2 s (major) · effect density per 10 s: zooms ≤3, transitions ≤2, SFX ≤3 (minor) ·
missing/broken asset or card blocker Q · missing chunk blocker I · A/V offset (RMS cross-correlation final vs voice stem) >1 frame major.
**Vision QA** (`ve_qa`, OpenRouter/KIE only; ≤8 frames lap 0, ≤4 changed windows later; skipped without vision consent, over cap,
checkBudget <0.15, breaker open). Per-frame text part: `{i, atSec, segmentType, expectedCaption, overlays, orientation, language}`.
```js
QaCategory = z.enum(["CAPTION_UNREADABLE","CAPTION_MISMATCH","CAPTION_COVERS_FACE","OVERLAY_COLLISION","TEXT_OFFSCREEN",
 "BROLL_OFF_TOPIC","BROLL_LOW_QUALITY","BROLL_WATERMARK","SPEAKER_CROPPED","BLACK_OR_BLANK_FRAME","CARD_RENDER_BROKEN",
 "LOGO_PROBLEM","EXPOSURE_OR_COLOR_JUMP","OTHER",
 // deterministic-only categories share the enum:
 "DURATION_MISMATCH","LOUDNESS","SILENCE","FREEZE","CLIPPED_WORD","AWKWARD_CUT","CAPTION_TIMING","COVERAGE","EFFECT_DENSITY","ASSET_BROKEN","AV_OFFSET",
 "CARD_COVERS_FACE"]);   // a title card's letters over the speaker's face (2026-09-18; cards are placed off the face first)
VisionVerdict = z.object({ pass:z.boolean(), score:z.number().min(0).max(10),
 issues:z.array(z.object({ frameIndex:z.number().int().min(0), atSec:z.number().min(0), category:QaCategory,
   severity:z.enum(["blocker","major","minor"]), elementId:z.string().max(40).optional(),
   evidence:z.string().max(200), fix:z.string().max(200).optional() })).max(12) });
```
Parse failure → `visionUnverified`, no vision-driven repairs; unknown elementId → re-resolve by time or drop; CAPTION_MISMATCH capped
at minor for hi/ar/ja.
**Category → repair op** (total mapping, test-enforced): CAPTION_COVERS_FACE & safe area → `captions.setPosition`/cue `pos` alt anchor ·
CAPTION_UNREADABLE → `captions.setStyle{box:true}` · CAPTION_MISMATCH & CAPTION_TIMING → `caption.rebuildFromWords{range}` ·
OVERLAY_COLLISION & TEXT_OFFSCREEN → move overlay / logo corner / card region · BROLL_OFF_TOPIC, BROLL_LOW_QUALITY, BROLL_WATERMARK →
`broll.replace{nextBestUnused}` else `broll.remove` · COVERAGE → remove lowest-score B-roll or `broll.setLayout{PIP}` · SPEAKER_CROPPED →
`framing.reset`/re-reframe from face track · CLIPPED_WORD → `cut.adjust{pad +60 ms (120 approx)}` · AWKWARD_CUT → merge tiny piece
(disable shorter adjacent cut) · BLACK_OR_BLANK_FRAME & FREEZE → force re-encode affected chunks, then nudge cut · CARD_RENDER_BROKEN &
ASSET_BROKEN → ASS card fallback → remove; `broll.replace` · LOUDNESS & SILENCE → re-run POST_PROCESSING with adjusted gain ·
EFFECT_DENSITY → disable lowest-priority effects · DURATION_MISMATCH → remux trim → full re-encode once · AV_OFFSET → rebuild voice stem ·
EXPOSURE_OR_COLOR_JUMP, LOGO_PROBLEM, OTHER, CARD_COVERS_FACE → report only.
**Laps:** ≤2 (1 when cpus <4 and D >90 s); stop when no blockers/majors, no ops apply, score fails to improve twice, or budget/cap
exhausted. Score `100 − 30·Iblockers − 15·Qblockers − 6·majors − 2·minors`. Verdict `blocked` (any I blocker) · `weak` (<50 or ≥2 Q
blockers) · `review` (<80 or any Q blocker/major) · `clean`. **Best lap** (pattern `agents/graph.js` best-lap ledger): rank no-I-blocker,
fewer Q blockers, higher score, later lap; if an earlier lap ships, append a `restore` revision so plan head matches the shipped
export; `exports.currentId` moves only to a render with no I blocker and (same planHash) score ≥ current.
Final shape (same family as `services/delivery_quality.js`): `{verdict, score, headline, issues:[{severity, class, category, area,
atSec, elementId, detail, fix, repairOp}], counts:{blockers, majors, minors}, signals:{loudness, durationDriftFrames, brollCoverage,
faceCoveredRatio, captionCoverage, sttTiming, faceTrack}, laps:[], shippedLap, unverified, visionUnverified}`.

## 8. Fault injection (`faults.js`)
Active only when `NODE_ENV!=="production"` or `VIDEO_EDIT_FAULTS_ALLOW=1`; global `VIDEO_EDIT_FAULTS="token,token"` and per-project
`settings.debugFaults` (same grammar). `/health.faultsActive` true and a boot warning when active.
Tokens: `or_stt:{429[:retryAfter]|402|401|500|timeout|bad_json|no_words|segments_only|drop_fillers}` · `kie_stt:{upload_fail|create_fail|
stall|fail_state|poll_error|slow:<s>}` · `islands:{error|invalid_json|approx_drift:<ms>}` · `vision:{429|402|timeout|invalid_json|
hallucinated_ids}` · `llm:{error|invalid_json|budget}` · `budget:{low|exhausted|cap:<usd>}` · `assets:{http500|empty|keyRejected}` ·
`render:{exit1|hang|chunk:<n>}` · `card` · `disk:full` · `crash:<STAGE>` · `slow:<STAGE>:<s>` · `probe:timeout` · `normalize:exit1`.
Injection points call `faults.maybeFail(point, ctx)` inside provider modules and `engine/proc.js` (not global fetch), so real retry /
breaker code runs. `scripts/lib/mock_ai_providers.cjs` emulates OpenRouter `/audio/transcriptions`, `/chat/completions`, `/key`,
`/credits` and KIE `file-stream-upload`, `jobs/createTask`, `jobs/recordInfo` from fixture truth (configurable filler drop, WER noise,
stall) — tests point providers at it via `VIDEO_EDIT_OPENROUTER_BASE` / `VIDEO_EDIT_KIE_BASE` (dev only).

## 9. Tests (`server/scripts/video_edit_*.test.cjs`, plain node, `t()` style as in `scripts/pacing.test.cjs`)
Offline: global fetch tripwire + temp dirs (`VIDEO_EDIT_DIR`, `VIDEO_EDIT_INDEX`), providers → mock server.
| File | Asserts |
|---|---|
| `video_edit_store.test.cjs` | transitions & actors; tmp files ignored; `.bak` recovery / STORE_CORRUPT; index rebuild; 409 stale revision; batchId replay; runId fencing; owner filter; `resolveInside` rejects `..`/absolute/NUL/symlink/case-variant prefix |
| `video_edit_recovery.test.cjs` | status × checkpoint → action; crash-loop guard; KIE task re-poll not re-create; `jobs.json` untouched; no entries in `db.takeOrphanedTasks()` |
| `video_edit_checkpoints.test.cjs` | inputHash determinism; skip on match; downstream-only invalidation; zero provider calls on resume |
| `video_edit_media.test.cjs` | lavfi-generated mp4/mov/webm/mkv pass; tmcd/attachments/subs ignored; renamed txt/png, `#EXTM3U`, `ffconcat` → 415 with zero outbound connections; truncated → UNDECODABLE; audio-only; 3 video streams; `-display_rotation 90` swaps dims; VFR/interlaced/HDR flags; limits; mocked statfs → 507; normalize outputs CFR 30 yuv420p, metadata stripped |
| `video_edit_routes.test.cjs` | every route except `/health` requires auth (walk `router.stack`); anon 401; other user 404; deleted user 401; evil Origin 403 without ACAO (GET + POST); forged multipart writes nothing; 300 KB ops body 413; Range 206; bad token 403; `/api/projects` never lists `ve_`; consent missing 422 |
| `video_edit_cancel.test.cjs` | long fake child killed <5 s; queued job skipped; temp removed; late write fenced |
| `video_edit_progress.test.cjs` | `-progress` parser with split chunks; weights sum 100; ETA EWMA |
| `video_edit_faults.test.cjs` | each token → matrix outcome; faults ignored in production without allow |
| `video_edit_policy.test.cjs` | static scan of `src/video_edit/**`: no `python` spawn, no `@huggingface/transformers`, `asset_clip`, `embeddings`, `onnxruntime`, `msedge-tts`, ffmpeg `whisper` filter |
| `generation_mode.test.cjs` | frozen constants; `modeOfJob` maps template kinds |
Later phases add: stt chain/chunking/alignment, cost & breaker, vision parsing, timeline, captions/ASS, rhythm, ops, broll scoring,
render cache/diffLevels, QA checks & category→op totality.
npm scripts: `test:edit-store`, `test:edit-recovery`, `test:edit-checkpoints`, `test:edit-media`, `test:edit-routes`,
`test:edit-cancel`, `test:edit-progress`, `test:edit-faults`, `test:edit-policy`, `test:generation-mode`, aggregate `test:edit`.
**Template regression:** `node scripts/run-regression.js --save` before changes, `--check` after (pass→fail flips fail; web lint
errors ≤ baseline).
