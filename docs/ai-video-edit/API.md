# AI Video Edit — HTTP API contract (`/api/video-edits`)

Status: contract for implementation (Phase 2+). Source of truth for routes, payloads, limits and error codes.
Companion docs: `ARCHITECTURE.md` (design), `ENGINE.md` (store, jobs, security, QA), `EDIT_PLAN.md` (plan schema + ops).

## 1. Mounting (additive hooks in `server/server.js`)
1. `const videoEdit = require("./src/video_edit");` near the other requires.
2. **Before** the global `app.use(express.json({ limit: "64kb" }))`:
   `app.use("/api/video-edits", express.json({ limit: "256kb" }));` (body-parser marks `req._body`, so the global parser skips).
3. After the admin router mount: `app.use("/api/video-edits", videoEdit.buildRouter());` (must stay before the `/api` 404).
4. After `janitor.start()`: `const stopVideoEdit = videoEdit.start();` — never throws; on internal failure the router answers 503.
5. In `shutdown()`: `stopVideoEdit()` (aborts runs, kills child processes, flushes store).

`buildRouter(deps = {})` accepts injectable dependencies for tests:
`{ requireUser, findUserById, store, engine, settings, now }` — defaults wire the real modules.

## 2. Middleware chain (order matters)
1. `GET /health` — no auth.
2. `originGuard` (every other route, before multer):
   - allowed origins = `WEB_ORIGIN` list ∪ same origin (`req.protocol + "://" + req.get("host")`) ∪ (`NODE_ENV!=="production"` ? `http://localhost:5173`).
   - `Origin` present and not allowed → remove `Access-Control-Allow-Origin/Credentials` set by the global CORS and return `403 ORIGIN_NOT_ALLOWED` (GET included — blocks cross-site authenticated reads).
   - No `Origin`, unsafe method, `Sec-Fetch-Site: cross-site` → 403. No Origin and no Sec-Fetch-Site (CLI/harness) → allowed.
   - JSON routes require `Content-Type: application/json` (415 otherwise).
3. `requireEditUser`: `middleware/auth.js readUserId(req)` → 401 `AUTH_REQUIRED`; `models/user.js findUserById(id)` missing → 401.
   Media routes also accept a playback token (§6) instead of the cookie.
4. `editsEnabled`: 503 `EDITS_DISABLED{reason}` when `NODE_ENV==="production"` and no `SECRET_KEY/JWT_SECRET`, ffmpeg/ffprobe
   missing, `videoEdit.enabled===false`, or no STT provider key (neither `OPENROUTER_API_KEY` nor `KIE_API_KEY`).
5. Per-user rate limits (`express-rate-limit`, `keyGenerator: req.userId`): create 10/h, ops 120/min, render 20/h,
   candidate search 10/h, events ≤3 concurrent streams/user.
6. `loadOwnedProject` for `/:id` routes: id regex `^ve_[0-9a-z]{16}$`; unknown id **or** other owner → `404 NOT_FOUND`.
   Sets `req.project`. Updates `lastOpenedAt` (debounced) on GET `/:id`.
7. Handler.
8. JSON error handler: `{ error: CODE, message, details?, retryable: boolean, requestId }`; never stack traces.

## 3. Routes
All mutations are **POST** (global CORS allows only GET/POST + Content-Type).

| Method & path | Request | Success | Errors |
|---|---|---|---|
| GET `/health` | — | `{enabled, reason?, ffmpeg:{ok,version}, providers:{openrouterStt, kieStt, vision, breakers:{openrouter,kie}}, queue:{depth, active, heavyWaiting}, diskFreeMb, storageUsedMb, faultsActive}` | — |
| GET `/capabilities` | — | `{limits, languages:[{code,name,native,dir}], captionStyles[], defaults:{settings}, costPerMinuteUsd:{low,high}, visionAvailable, stockVideoAvailable}` | 401 |
| POST `/` | multipart: `video` ×1 (required), `logo` ×0–1, `settings` (JSON string), `clientRequestId` (≤64, `[A-Za-z0-9_-]`) | **201** `{project: ProjectView, costEstimate:{usdLow, usdHigh}}`; same user + same `clientRequestId` within 24 h → **200** same project | 400 `VALIDATION_FAILED`, 403, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA`, 422 `MEDIA_REJECTED{reason}` / `CONSENT_REQUIRED` / `VALIDATION_FAILED`, 429, 503, 507 `INSUFFICIENT_STORAGE` |
| GET `/` | `?cursor&limit≤50&status` | `{projects: ProjectSummary[], nextCursor}` (owner's only, newest first) | 401 |
| GET `/:id` | — | `ProjectView` (§4) | 404 |
| GET `/:id/progress` | — | `{status, stage, stagePct, overallPct, etaSec, queuePosition, planRevision, activeRenderId, updatedAt}` | 404 |
| GET `/:id/events` | cookie or `?t=` token | SSE (§5) | 404, 429 |
| GET `/:id/plan` | `?rev=` | `{revision, hash, author, createdAt, plan}` — the plan view carries no file paths, no hashes and no provider URLs: a B-roll asset shows `attribution` text plus the `thumbUrl` media route, and the clickable provider links live in `/:id/candidates` and the credits file | 404 |
| GET `/:id/plan/revisions` | — | `{head, revisions:[{rev, hash, parent, author, opsCount, summary, createdAt}], canUndo, canRedo, undoLabel, redoLabel}` | 404 |
| GET `/:id/transcript` | — | `{language, timing:'word'\|'approx', words:[{i,text,start,end,conf,isFiller,sentenceId}], sentences:[…]}` | 404, 409 `NOT_READY` |
| POST `/:id/ops` | `{expectedRevision:int, batchId:string, ops: Op[≤100]}` (see `EDIT_PLAN.md` §Ops) | `{revision, hash, applied:int, warnings:[], invalidates:{level:'NONE'\|'AUDIO'\|'COMPOSITE'\|'BASE', ranges:[[outIn,outOut]]}, cost?}` | 409 `REVISION_CONFLICT{headRevision}`, 422 `INVALID_OP{index, reason}`, 423 `PROJECT_LOCKED` |
| POST `/:id/undo` · `/:id/redo` | `{expectedRevision}` | as `/ops` | 409 |
| POST `/:id/settings` | `{expectedRevision, settings: Partial<Settings>, confirmReanalyze?:bool}` | render-only change → 200 (applied as ops); analysis-affecting (language forced, privacy) → **202** `{requeuedFrom, estimate:{sec, usdLow, usdHigh}}` | 409 `REANALYZE_REQUIRED{estimate}` when not confirmed, 422 |
| GET `/:id/candidates` | `?itemId&limit≤20` | `{candidates:[{id, provider, type, durationSec, w, h, thumbUrl, previewUrl?, score:{total, lexical, judgeRelevance, quality, fit}, issues:[], license, attribution, used}]}` | 404 |
| POST `/:id/candidates/search` | `{itemId, query≤80}` | 202 `{searchId}` (results via SSE `candidates`) | 422, 429 |
| POST `/:id/render` | `{kind:'preview'\|'export', planRevision:int, profile?:'preview540'\|'export720'\|'export1080'}` | **202** `{renderId, queuePosition}`; identical `planHash+kind+profile` done → **200** `{renderId, cached:true}` | 409 `REVISION_CONFLICT`, 423 |
| GET `/:id/renders/:rid` | — | render record incl. `qa` summary | 404 |
| GET `/:id/exports` | — | `{currentId, stale, items:[{renderId, planRev, profile, createdAt, qa:{verdict, score}, files:{mp4, srt, vtt, credits}}]}` | 404 |
| POST `/:id/cancel` | `{target:'pipeline'\|'render', renderId?}` | 202 `{cancelling:true}` | 409 `NOTHING_TO_CANCEL` |
| POST `/:id/retry` | `{stage?, mode:'resume'\|'force', continueWithout?:'transcript'\|'broll'\|'vision'}` | 202 `{fromStage}` | 409 `ILLEGAL_TRANSITION`, 422 `NOT_RETRYABLE` |
| POST `/:id/delete` | `{confirm: "<id>"}` | 202 `{deleting:true}`; afterwards every route → 404 | 422 |
| POST `/:id/logo` | multipart `logo` (png/jpg/webp ≤5 MB, ≤4096 px; SVG only if rasterizable) | `{revision}` (re-encoded to PNG by ffmpeg, metadata stripped; applied as `branding.setLogo` op) | 415, 422, 409 |
| POST `/:id/playback-token` | `{items:[{kind, key?}]}` | `{urls:[{kind,key,url}], expiresAt}` (15 min; downloads 5 min) | 422 |
| GET `/:id/media/:kind/:key?` | cookie or `?t=`; `?download=1` | 200 / 206 (Range) | 403 `MEDIA_TOKEN_INVALID`, 404, 416 |

### Media kinds (resolved from `project.json`, never from the URL path)
`source-proxy` (540p proxy; the original is **never** served) · `poster` · `preview` (key = renderId) · `export` (key = renderId) ·
`captions` (key = `<renderId>.srt|.vtt`) · `credits` · `thumbs` (key = index) · `waveform` · `broll-thumb` (key = candidateId) ·
`broll-preview` · `card-preview` (key = graphicId) · `logo` · `frame` (key = `<rev>_<frameMs>`, P2). Key regex `^[a-z0-9_.-]{1,64}$`.

Streaming: `res.sendFile(rel, { root: projectDir, dotfiles:"deny", acceptRanges:true, etag:true, cacheControl:false })` with headers
`Cache-Control: private, no-store`, `Content-Security-Policy: sandbox; default-src 'none'`, `X-Content-Type-Options: nosniff`,
`Content-Disposition: attachment; filename="<ascii-title>.<ext>"` when `download=1`; `Cross-Origin-Resource-Policy: cross-origin`
only when `WEB_ORIGIN` is set. Open streams are tracked per project so delete can destroy them.

> **As built (phase 7):** render/exports/logo shapes, render media kinds and the client field names (`renderId`, `planRevision`) are documented in `IMPLEMENTATION.md` §5; that section wins over the rows above where they differ.

## 4. Views
```ts
ProjectSummary = { id, title, status, stage, overallPct, createdAt, updatedAt, lastOpenedAt, durationSec, outputDurationSec|null,
  orientation, posterUrl|null, currentExportId|null, qaVerdict|null }
ProjectView = ProjectSummary & {
  mode: 'AI_VIDEO_EDIT', statusReason: {code, message, retryable, stage, actions:[string]}|null,
  progress: {stage, stagePct, overallPct, message, stageStartedAt, etaSec, queuePosition},
  source: {displayName, sizeBytes, durationSec, width, height, fps, rotation, hasAudio, orientation},   // no tags, no paths
  settings: Settings, consent: {thirdPartyAi, termsVersion, at},
  stages: { [STAGE]: {status, attempts, engine?, durationMs?, costUsd?, fallbacks:[string]} },
  discoveries: { language?, words?, wpm?, fillersFound?, silencesFound?, silenceSec?, topics?:[string], hook?:string,
                 brollMoments?, faceFound?, onScreenText?:[[s,e]] },   // live-filled for the analysis screen
  plan: {headRevision, headHash, canUndo, canRedo} | null,
  renders: RenderRecord[], exports: {currentId, stale},
  qaSummary: {verdict, score, headline, counts} | null,
  notices: [{code, severity:'info'|'warn', stage, message}],
  cost: {estimateUsd, capUsd, spentUsd},
  allowedActions: ['cancel'|'retry'|'render'|'export'|'delete'|'edit'] }
```

## 5. SSE `/:id/events`
Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; first line `retry: 3000`.
Events (each `data` is JSON with a monotonically increasing `seq`):
`snapshot` (ProjectView, on connect) · `progress` (≤2/s) · `stage` (`{stage, status, engine?, fallback?}`) · `discovery` (partial
`discoveries`) · `plan` (`{headRevision, headHash, author}`) · `render` (`{renderId, status, pct, etaSec}`) · `candidates`
(`{itemId, searchId, candidates}`) · `qa` (`{renderId, verdict, score}`) · `done` (terminal status). Comment ping `: ping` every
15 s; max life 30 min (client reconnects). Close detection via `res.on("close")` (not `req`, see `routes/projects.js:148-169`).
Clients fall back to polling `GET /:id/progress` every 1.5 s (5 s when hidden).

## 6. Playback tokens
`token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(key, payload))`; `key = HKDF(SECRET_KEY || dev secret,
"video-edit-media")`; payload `{p: projectId, u: userId, k: kind, key, exp}`; verify with `timingSafeEqual`, then re-check the
project still exists and belongs to `u`. Used only for browser `<video>`/SSE on split deploys — never sent to AI providers.

## 7. Settings (zod, `video_edit/settings_schema.js`)
```ts
Settings = {
  title?: string≤120,
  language: 'auto'|'en'|'hi'|'es'|'fr'|'de'|'pt'|'ar'|'ja',                 // default 'auto' (STT-detected)
  output: { aspect: 'source'|'9:16'|'16:9'|'1:1' },                          // default 'source' → nearest supported
  captions: { enabled: true, styleId: 'bold_pop'|'clean'|'karaoke_blob'|'single_word'|'minimal_lower'|'brand_bar',
              maxWordsPerLine: 1|2|3, position: 'auto'|'top'|'center'|'bottom', language: 'auto'|<code> },
  brand: { palette: {primary:'#rrggbb', secondary?:'#rrggbb', source:'preset'|'manual'|'logo', presetId?} | null,
           logo: { placement:'tl'|'tr'|'bl'|'br', show:'always'|'intro_outro' } },
  music: { enabled: true, mood?: string≤40, volumeDb?: -30..0 },
  sfx: { enabled: true },
  broll: { enabled: true, intensity: 'low'|'medium'|'high', allowImages: true },
  effects: { intensity: 'subtle'|'dynamic', autoJumpCuts: true },
  removeFillers: 'off'|'light'|'aggressive',                                 // default 'light' (pure fillers only)
  removeSilence: { enabled: true, pace: 'natural'|'fast'|'extra_fast' },     // natural 0.6 s+, fast 0.35 s+, extra_fast 0.2 s+
  goals?: string≤500,                                                         // screened with prompt_moderation.screen
  autoRender: true,
  exportProfile: 'export1080'|'export720',
  privacy: { allowCloudVision: true },
  consent: { thirdPartyAi: true, termsVersion: string },                     // REQUIRED true at create
  maxCostUsd?: number                                                         // ≤ server cap
}
```
Defaults live in `settings_schema.DEFAULT_SETTINGS`; unknown keys stripped; `debugFaults` accepted only when faults are allowed (`ENGINE.md` §Faults).

## 8. Limits (defaults; `config.videoEdit.limits` / `VIDEO_EDIT_*` env override)
| Limit | Default |
|---|---|
| Upload size | 500 MB (`maxUploadMb`); multer `files:2, fields:8, fieldSize:64KB, parts:12` |
| Duration | 3–300 s (`maxDurationSec`, hard ceiling 600) |
| Resolution | short edge ≥360 px (warn <720), long edge ≤4096 px |
| Frame rate | 12–120 fps |
| Workload | `w·h·fps·dur ≤ 3.73e10` (≈ 1080p60 for 5 min) |
| Containers | ISO-BMFF (`mov,mp4,m4a,3gp,3g2,mj2`) or `matroska,webm` |
| Video codecs | h264, hevc, vp8, vp9, av1, mpeg4, prores |
| Audio codecs | aac, mp3, opus, vorbis, pcm_s16le, pcm_s24le, pcm_f32le, alac, flac, ac3, eac3 |
| Streams | exactly one non-`attached_pic` video; 1–4 audio (required); data/tmcd/subtitle/attachment ignored (never mapped); total ≤16 |
| Bitrate | ≤200 Mbps |
| Per user | ≤20 projects, ≤3 GB, 1 running + 2 queued, 10 creates/day |
| Global | 50 creates/day, `editsDir` ≤20 GB, free-disk floor 2 GB, AI spend `dailyUsdCap` 5.00 |
| Per project | AI spend cap `maxUsdPerProject` 0.50 |
Separate from template `dailyJobCap` (which counts `jobs.json` only).

## 9. Error codes
401 `AUTH_REQUIRED` · 403 `ORIGIN_NOT_ALLOWED`, `MEDIA_TOKEN_INVALID` · 404 `NOT_FOUND` · 409 `REVISION_CONFLICT`,
`ILLEGAL_TRANSITION`, `NOTHING_TO_CANCEL`, `REANALYZE_REQUIRED`, `NOT_READY` · 413 `FILE_TOO_LARGE`, `BODY_TOO_LARGE` ·
415 `UNSUPPORTED_MEDIA` · 416 `RANGE_NOT_SATISFIABLE` · 422 `VALIDATION_FAILED`, `CONSENT_REQUIRED`, `INVALID_OP`,
`NOT_RETRYABLE`, `MEDIA_REJECTED` with `reason ∈ {DURATION_TOO_LONG, DURATION_TOO_SHORT, RESOLUTION_TOO_LOW,
RESOLUTION_TOO_HIGH, FRAME_RATE_OUT_OF_RANGE, NO_VIDEO_STREAM, NO_AUDIO_STREAM, MULTIPLE_VIDEO_STREAMS, TOO_MANY_STREAMS,
UNSUPPORTED_CODEC, UNSUPPORTED_CONTAINER, UNDECODABLE, PROBE_TIMEOUT, WORKLOAD_TOO_LARGE, BITRATE_TOO_HIGH}` ·
423 `PROJECT_LOCKED` · 429 `RATE_LIMITED`, `QUOTA_EXCEEDED`, `DAILY_CAP_REACHED`, `AI_BUDGET_EXHAUSTED` ·
503 `EDITS_DISABLED{reason}` · 507 `INSUFFICIENT_STORAGE`. Every error body carries `retryable`.

## 10. Web client (`web/src/editApi.js`)
- `fetch` wrapper with `credentials:"include"` and `EditApiError(message, status, body)` (same shape as `web/src/api.js json()`).
- Upload with `XMLHttpRequest` (`withCredentials=true`, `xhr.upload.onprogress` → client UPLOAD stage; then "Checking the
  footage…" until 201; `xhr.abort()` to cancel; never set Content-Type; reuse `clientRequestId` on retry). No custom headers.
- `watchEdit(id, {onUpdate, signal, timeoutMs})`: SSE first (`withCredentials`), fallback to polling after 10 s without messages
  or 2 errors; backoff 1→30 s with jitter; 401 → `onNeedAuth`; 404 → not-found state.
- Media URLs from `/playback-token` when `API_BASE` is cross-origin; same-origin uses cookies directly.
