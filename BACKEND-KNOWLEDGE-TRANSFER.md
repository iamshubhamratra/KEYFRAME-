# KEYFRAME — Backend Knowledge Transfer

> Complete engineering reference for the `server/` backend: architecture, every subsystem, the
> request lifecycle, configuration, failure modes, and how to extend it.
>
> **Written:** 2026-07-30 · **Repo:** `C:\internship\KEYFRAME` · **Branch:** `session/track-source-and-quality-fixes`
>
> Everything here was read out of the current source tree, not from memory. Where a fact lives in a
> gitignored file (`config.json`, `.env`) it is marked. Line references are `file.js:NNN` format and
> were accurate at time of writing.

---

## Table of contents

1. [What KEYFRAME is](#1-what-keyframe-is)
2. [Repo layout](#2-repo-layout)
3. [Runtime, dependencies, how to run](#3-runtime-dependencies-how-to-run)
4. [Configuration](#4-configuration)
5. [Data model — the job record](#5-data-model--the-job-record)
6. [HTTP API surface](#6-http-api-surface)
7. [Process architecture — queue, orchestrators, crash recovery](#7-process-architecture)
8. [Flow A — `/api/projects` (two-act + LangGraph)](#8-flow-a--apiprojects)
9. [Flow B — `/api/generate` (single-shot ladder)](#9-flow-b--apigenerate)
10. [The LLM layer](#10-the-llm-layer)
11. [Ingest subsystem](#11-ingest-subsystem)
12. [Asset subsystem](#12-asset-subsystem)
13. [Screenshot subsystem](#13-screenshot-subsystem)
14. [Audio subsystem](#14-audio-subsystem)
15. [Composition subsystem — the five render paths](#15-composition-subsystem)
16. [Frame packs](#16-frame-packs)
17. [Quality gates and repair](#17-quality-gates-and-repair)
18. [Rendering](#18-rendering)
19. [Storage, retention, the janitor](#19-storage-retention-the-janitor)
20. [Authentication](#20-authentication)
21. [Cost accounting and observability](#21-cost-accounting-and-observability)
22. [Development workflow and hazards](#22-development-workflow-and-hazards)
23. [Known issues and failure modes](#23-known-issues-and-failure-modes)
24. [How to extend it](#24-how-to-extend-it)
25. [Glossary](#25-glossary)

---

## 1. What KEYFRAME is

KEYFRAME is a **multi-modal AI video studio**. A user supplies some combination of:

- a text prompt ("a 30s promo for my note-taking app"),
- a **website URL** (the pipeline scrapes copy, brand colors, screenshots and the site's own images),
- a **blog/article URL** (the film is built from the article's argument and its inline images),
- a **reference video upload** (transcribed + style-analysed to imitate its pacing and palette),

…and the backend produces a fully animated, narrated, music-scored **MP4** (plus an optional `.srt`).

The output engine is **HyperFrames** (HeyGen's framework). A "composition" is a **single self-contained
HTML document** — GSAP timeline + inline SVG/CSS, optionally Three.js — that a headless-Chrome renderer
seeks frame-by-frame and encodes to MP4 through ffmpeg. The backend's entire job is to **write that HTML
document well**, then render it.

Two philosophies coexist in the composition layer, and understanding this split explains most of the
codebase:

| | **Deterministic** (default) | **LLM composer** (opt-in "premium") |
|---|---|---|
| Who writes the HTML | JavaScript in `scene_kit.js` / `template_engine.js` / a per-pack composer | The LLM, freehand, from a 136KB system prompt |
| Guarantees | Lint-clean, no overlap, no truncation, by construction | None — gated, repaired, and fallback-protected |
| Cost / time | ~$0.05 / ~7 min for a 25s film | ~$0.15–0.45 / 10–48 min |
| Enabled by | default (`llm.useComposer:false`) | `composeMode:"premium"` per job |

The deterministic path is the primary product. The LLM composer exists for bespoke output and is
deliberately kept behind an opt-in.

---

## 2. Repo layout

```
KEYFRAME/
├── server/                      ← THIS DOCUMENT. Node 22 Express backend, port 8080.
│   ├── server.js                ← entrypoint (207 lines)
│   ├── config.json              ← runtime config (GITIGNORED — holds live API keys)
│   ├── config.example.json      ← committed template
│   ├── .env                     ← secrets (GITIGNORED)
│   ├── jobs.json                ← the "database" (a JSON array of job records, ~4 MB)
│   ├── auth-store.json          ← users + OTPs (GITIGNORED)
│   ├── src/
│   │   ├── config.js            ← config loader + validator + env overrides
│   │   ├── db.js                ← in-memory job store w/ atomic JSON persistence
│   │   ├── routes/              ← 6 Express routers
│   │   ├── agents/              ← graph.js (LangGraph) + qa_agent.js
│   │   ├── auth/                ← store, helpers, middleware, mailer, templates
│   │   ├── prompts/             ← 13 system-prompt markdown files
│   │   ├── fonts/pack_fonts.js  ← base64-inlined @font-face for pack display faces
│   │   └── services/            ← 105 modules: the whole pipeline
│   ├── scripts/                 ← dev-watch, audits, harnesses, tests
│   ├── public/
│   │   ├── dist/                ← built React SPA (served at /)
│   │   ├── videos/              ← rendered MP4s + posters + .srt (served at /videos/*)
│   │   └── omelette-templates/  ← original bundled template bundles
│   ├── jobs/<jobId>/            ← per-job working dir (index.html, meta.json, assets/, audio/)
│   ├── asset_cache/             ← the local asset DB (index.json + files/)
│   ├── asset_library/           ← 9,888 curated offline assets (gitignored, OFF by default)
│   └── showcase/                ← hand-authored reference compositions (never swept)
├── frames/                      ← 80 frame packs (design systems); each = FRAME.md + pack.json (+ preview)
├── web/                         ← React + Vite SPA source
├── pixabay-no-node-modules/     ← headless-Chrome Pixabay bridge daemon (port 3007)
└── heygen-keyframes-video/      ← separate side app
```

---

## 3. Runtime, dependencies, how to run

**Runtime:** Node 22 (Node ≥18.20 needed for the `spawnCompat` shell handling). No native modules —
deliberately, so it deploys anywhere.

**Production dependencies** (`server/package.json`) — only 16:

| Package | Used for |
|---|---|
| `express`, `express-rate-limit`, `cookie-parser`, `multer` | HTTP layer, rate limits, cookies, video upload |
| `p-queue` (v6, CJS) | the job queue |
| `@langchain/langgraph`, `@langchain/core` | the production agent graph |
| `puppeteer-core` | website ingest, contrast/layout checks, runtime smoke, Pixabay scrape |
| `@huggingface/transformers` | local CLIP relevance scoring (optional, fail-soft) |
| `zod` | strict JSON validation of brief/script |
| `bcryptjs`, `jsonwebtoken`, `nodemailer` | auth |
| `nanoid` | job IDs (10-char lowercase alphanumeric) |
| `openai` | OpenAI-compatible client surface |
| `msedge-tts` | legacy TTS fallback |

**External binaries required on PATH:** `ffmpeg`, `ffprobe`, `npx` (which fetches `hyperframes` on
demand). Chrome/Chromium is resolved from the puppeteer cache or `PUPPETEER_EXECUTABLE_PATH`.

**Scripts** (`npm run …`):

| Script | What |
|---|---|
| `start` | `node server.js` — production |
| `dev` | `node scripts/dev-watch.js` — **the only correct dev command** (see §22) |
| `test:engine` / `test:media` / `test:director` / `test:align` | unit-ish harnesses |
| `audit:contrast` / `audit:identity` / `audit:portrait` / `audit:families` | quality audits over all packs |
| `check:packs` / `check:templates` | pack-manifest and template integrity gates |

---

## 4. Configuration

Configuration has three layers, applied in this order (later wins):

1. `config.example.json` — the committed template, showing shape.
2. `config.json` — the real file, **gitignored**, holds live API keys.
3. Environment variables — override specific keys at boot (`src/config.js:129-186`).

`src/config.js` does four things: load + merge, apply env overrides, **validate** (throwing at boot on
an invalid config), then attach helpers and freeze.

### 4.1 The `config.json` blocks

| Block | Key fields | Notes |
|---|---|---|
| `server` | `port`, `maxDurationSec` (180), `minDurationSec` (5), `rateLimitPerHourPerIp` (5), `dailyJobCap` (100), `videoTtlHours` (168), `maxStorageMb` (2000), `jobConcurrency`, `renderWorkers`, `watchdog*`, `stageBudgetSec` | `jobConcurrency`/`renderWorkers` accept `"auto"` → resolved from CPU + RAM |
| `render` | `hyperframesVersion` (pinned `0.6.120`) | Unpinned `latest` caused ETARGET races and all-0-frame renders |
| `llm` | see §10 | the biggest block |
| `orientations` / `qualities` / `defaults` / `allowedFps` | 16:9, 9:16, 1:1 × 480p/720p/1080p, fps 24/30/60 | `dimensionsFor()` maps orientation+quality → w/h |
| `audio` | `ttsProvider`, `ttsModel`, `ttsVoiceId`, `pixabayKey`, `freesoundToken`, `defaultMusicVolume` | |
| `frames` | `dir` (`../frames`), `defaultPack` (`blockframe`) | |
| `orchestrator` | `"langgraph"` | switches production to the agent graph |
| `topicShots` | `enabled`, `max` (6) | topic-only screenshot capture |
| `imageGen` | `enabled:false, removed:true` | **AI image generation was removed 2026-07-30** — films use real assets only |
| `qa` | `enabled`, `maxRepairs` (2) | vision QA + repair budget |
| `stt` | `provider:"local"`, `localModel:"small"`, `pythonBin` | faster-whisper for reference-video transcription |
| `assetProviders` | `order:["pixabay","openverse","pexels","pixabay_scrape"]` + per-provider keys | |
| `ingest` | `maxUploadMb`, `websiteTimeoutMs`, `peekshot:{apiKey,projectId}` | |
| `paths` | `jobsDir`, `videosDir`, `uploadsDir`, `dbFile` | resolved to absolute at boot |

### 4.2 Environment variables

Secrets (in `.env`, see `.env.example`):

```
OPENROUTER_API_KEY   KIE_API_KEY   PIXABAY_API_KEY   PEXELS_API_KEY   FREESOUND_TOKEN
PEEKSHOT_API_KEY     PEEKSHOT_PROJECT_ID
SECRET_KEY           GMAIL_USER    GMAIL_PASS
```

Behaviour flags:

| Var | Effect |
|---|---|
| `PIXABAY_ONLY=1` | every asset must come from Pixabay; drops openverse/pexels/iconify and Freesound |
| `MEDIA_PROVIDER=pixabay-api` | promotes a provider to the front of the search order |
| `USE_CURATED_LIBRARY=1` | re-enables the offline `asset_library/` (off by default — served off-topic clip-art) |
| `USE_LLM_COMPOSER` | global composer default (per-job `composeMode` overrides) |
| `CREATIVE_DIRECTOR`, `ART_DIRECTOR`, `TEXT_DIRECTOR`, `TEMPLATE_DIRECTOR`, `VISUAL_LAYOUT_DIRECTOR` | `0` disables that agent |
| `ART_DIRECTOR_MODEL`, `TEXT_DIRECTOR_MODEL`, `TEMPLATE_DIRECTOR_MODEL` | per-agent model override |
| `CONTRAST_GATE` | `off` / `warn` (default) / `repair` |
| `IDENTITY_GATE` | palette-drift gate mode |
| `JOB_CONCURRENCY`, `RENDER_WORKERS`, `RENDER_QUALITY`, `PORT` | ops |
| `LOG_LEVEL`, `LOG_JSON=1` | logging |
| `PIXABAY_BRIDGE_URL`, `PIXABAY_BRIDGE_DISABLED=1` | the vector/music bridge |
| `WEB_ORIGIN` | comma-separated CORS allowlist for split deploys |

### 4.3 Boot validation (`src/config.js:60-107`)

The validator **refuses to start** on:
- missing LLM API key (neither `llm.apiKey` nor `OPENROUTER_API_KEY`),
- an incomplete `llm.primary` block,
- a `kie:<route>` model alias naming a route absent from `llm.kieRoutes` (dangling alias),
- a `kie:` alias configured with no KIE key anywhere,
- **every** model being a `kie:` alias (there would be no OpenRouter fallback during a KIE outage).

This is deliberate: these all used to fail mid-render instead of at boot.

---

## 5. Data model — the job record

There is **no real database**. `src/db.js` is an in-memory `Map<jobId, record>` persisted to
`jobs.json` by a debounced atomic write (write to `.tmp`, then rename).

**Trade-off accepted on purpose:** no native deps, works anywhere, trivially fast up to a few thousand
jobs. `jobs.json` is currently ~4 MB / 367 jobs.

### 5.1 Record fields (`db.js:174-219`)

Internal record is snake_case; `shape()` (`db.js:130`) converts to camelCase for the API.

```
id, kind ("generate"|"project"), prompt, duration, orientation, quality, width, height, fps,
frame_pack, frame_pack_user (1 = user picked it in the gallery, pins the deterministic path),
status, progress, video_url, error, used_fallback, final_attempt, compose_mode,
llm_tokens_in/out, usage (full cost snapshot), stage_timings,
created_at, started_at, finished_at, client_ip,
voice_style, captions_enabled, upload_path, intent, autopilot, render3d,
brief, script, script_warnings, assets, captions, srt_url,
qa, creative_review, quality_report, brand_review, layout_review, text_review, template_review,
task (the full replayable task for crash recovery), requeue_count, last_requeue_at
```

### 5.2 Status / progress machine

`status`: `queued` → `running` → `done` | `failed`. Project jobs additionally pause at
`script_review` and resume via the approve endpoint.

`progress` values (the UI's stage label):

- **Project intake:** `ingest` → `brief` → `script` → *(pause)*
- **Project production:** `storyboard` → `assets` → `composing` → `audio` → `finalizing`
- **Single-shot:** `brief` → `storyboard` → `assets` → `composing` → `qa` → `audio` → `finalizing`

### 5.3 Crash recovery (`db.js:100-128`)

At boot, any job left `running` is inspected:
- a `generate` job with a stored `task` → requeued verbatim,
- a `project` job → requeued at `intake` or `production` (production only if a script was persisted),
- otherwise → marked `failed` with `"server restarted while job was in-flight"`.

Guarded by `MAX_REQUEUES` and a `REQUEUE_COOLDOWN_MS`, so a crash-looping job can't requeue forever.
`server.js:84-93` drains `db.takeOrphanedTasks()` into the queue at startup.

---

## 6. HTTP API surface

Mounted in `server.js:135-140`. All app routes are under `/api` except `/health`.

### 6.1 Generation

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/generate` | Single-shot: prompt in, video out. No script checkpoint. |
| `POST` | `/api/projects` | Create a project; runs intake; **pauses at `script_review`**. Accepts JSON or multipart (video upload). |
| `GET` | `/api/projects` | List projects |
| `GET` | `/api/projects/:id` | Full state incl. brief, script, warnings |
| `GET` | `/api/projects/:id/events` | SSE progress stream |
| `POST` | `/api/projects/:id/approve` | Submit the (edited) script → starts production |
| `POST` | `/api/projects/:id/regenerate` | Re-run from `brief` or `script` |
| `GET` | `/api/jobs/:id` | Shaped job record + live ETA |
| `GET` | `/api/jobs/:id/stream` | SSE job stream |

**`POST /api/generate` body** (validated in `routes/generate.js:18-118`):

```jsonc
{
  "prompt": "string, 10–2000 chars",     // required
  "duration": 25,                         // 5–180 seconds
  "orientation": "horizontal|vertical|square",
  "quality": "480p|720p|1080p",
  "fps": 24|30|60,
  "tts": true, "music": true, "soundEffect": true,   // all default false
  "images": true, "video": false,                     // visual asset flags
  "captions": false,                                  // burnt-in subtitles, OPT-IN
  "render3d": false,                                  // Three.js composer
  "composeMode": "standard|premium",
  "voice": "…",                                       // must be in VALID_VOICES
  "framePack": "blueprint-atelier|auto"               // explicit pack = STRICT pin
}
```

Returns `202` with `{ jobId, statusUrl, jobsAhead, concurrency, estimatedRenderSec, estimatedWaitSec, estimatedTotalSec }`.

Two caps apply: a per-IP rate limit (`rateLimitPerHourPerIp`, default 5/hour) and a global
`dailyJobCap` (100 in 24h) returning `429`.

### 6.2 Frames, health, auth

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/frames` | List all 80 packs with label, vibe, palette, preview video/poster, and a `portrait` flag (derived from `poster.jpg` dims, mtime-cached) so the gallery can split Horizontal/Vertical |
| `GET` | `/api/frames/:name/showcase` | The pack's reference render |
| `GET` | `/health` | `{ ok, queueDepth, activeJobs, diskFreeMb, uptimeSec, version }` — the ELB health check |
| `POST` | `/api/auth/signup` \| `/login` \| `/logout` | JWT-cookie session |
| `GET` | `/api/auth/me` | Current user (401 if none) — the only auth-guarded route |
| `POST` | `/api/auth/forgot/send-otp` \| `/verify-otp` \| `/set-new-password` | OTP reset flow |

**Note:** generation endpoints are **not** auth-guarded. Auth exists for the UI's account features;
the API is otherwise keyless and open (protected only by IP rate limits).

### 6.3 Middleware chain (`server.js:95-161`)

1. `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` on every response.
2. CORS — `WEB_ORIGIN` allowlist; if unset, any origin is echoed. `Allow-Credentials: true` for the auth cookie.
3. `express.json({ limit: "64kb" })` + `cookieParser()`.
4. Routers.
5. Static: `public/dist` (the SPA) first, then `public/` (videos get `Cache-Control: public, max-age=3600` and `Accept-Ranges: bytes`).
6. `/api/*` catch-all → `404 {"error":"not found"}`.

---

## 7. Process architecture

### 7.1 The queue

One `p-queue` instance, concurrency = `config.server.jobConcurrency` (currently **1**). Three enqueue
functions (`server.js:57-80`):

- `enqueue(task)` → `pipeline.runJob(task)` — the single-shot path
- `enqueueIntake(jobId)` → `projectPipeline.runIntake(...)` — Act 1
- `enqueueProduction(jobId)` → **`agents/graph.runProductionGraph()` when `config.orchestrator === "langgraph"`**, else `projectPipeline.runProduction()` — Act 2

`runIntake` receives `onApproved: enqueueProduction`, which is how **autopilot** (auto-approve the
script) resumes straight into production without a user click.

### 7.2 Boot sequence (`server.js:45-181`)

```
mkdir jobs/ videos/ uploads/
→ load p-queue, compute concurrency
→ drain orphaned tasks from db → requeue
→ build express app + middleware + routers + static
→ frame_manifest.validateAll()          // logs "N/N packs have a valid pack.json" (currently 80/80)
→ listen on :8080
→ janitor.start()                        // every 10 min
→ skills.warmUp()  catalog.warmUp()  pixabayBridgeDaemon.warmUp()   // background, non-fatal
```

**Boot-time ESM preload** (`server.js:37-43`): `@langchain/langgraph` and `@huggingface/transformers`
are imported eagerly at boot. Under a file watcher, a *runtime* dynamic `import()` adds new files to
the watch set and restarts the process — which used to kill every in-flight job. Boot-time import is
safe; failures are non-fatal.

### 7.3 Shutdown

`SIGTERM`/`SIGINT` → stop janitor, pause queue, close server, persist db, `process.exit(0)`, with a
30s unref'd timeout as a backstop. `uncaughtException`/`unhandledRejection` are logged, **not** fatal.

---

## 8. Flow A — `/api/projects`

This is the flow the web app actually uses. Two acts with a human checkpoint between them.

```
Act 1  runIntake()
  intent → [ingest: website ∥ blog ∥ video]  → brief → draft script → PAUSE (script_review)
                                                             ↓
                          user edits VO lines / durations / asset queries in the Script Room
                                                             ↓
Act 2  runProductionGraph()  (LangGraph, config.orchestrator === "langgraph")
```

### 8.1 Act 1 — intake (`services/project_pipeline.js:45`)

1. `progress = "ingest"` — website / blog / reference-video workers run **in parallel** (§11).
2. `progress = "brief"` — `services/brief.js`: one LLM call, **zod-validated** strict JSON, one repair
   re-ask on failure. Produces `{ subject, tone, goal, audience, keyMessages[], brandColors[],
   suggestedFramePack, … }`. The brief also **picks the frame pack** when the user chose "auto".
3. `progress = "script"` — `services/script.js`: brief → a scene-by-scene production script with
   per-scene `voiceover`, `durationSec`, `startSec`, `sfx[]`, asset queries. Zod-validated.
   `normalizeScript()` re-derives scene starts so user edits to durations stay consistent.
4. Persist via `db.markScriptReview()` and **stop**. Status stays until approve.

`POST /:id/approve` re-validates the user's edited script with the *same* `validateScript()` rules,
then calls `enqueueProduction`.

### 8.2 Act 2 — the production graph (`src/agents/graph.js`)

15 nodes, compiled once and cached. State channels are declared in `Annotation.Root` (`graph.js:1056`).

```
                    START
                      │
               frame_selector
        ┌────────┬────┴────┬──────────┐
        │        │         │          │
  storyboard  asset_    voice_    art_director
    _agent    planner    agent    (brand skin)
        │        │         │          │
  scene_planner  asset_search         │
        │        │                    │
  text_director  │                    │
        └────┬───┘                    │
      visual_layout_director          │
             └──────────┬─────────────┘
                   composition
                        │
                    animation
                        │
                    timeline          (render + audio mix)
                        │
                     qa_agent ─────────────┐
                    ╱    │    ╲            │
        contrast_repair  │   repair        │
              └──────────┴─────┘         END
              (both loop back to qa_agent)
```

**Node by node:**

| Node | File it wraps | What it does |
|---|---|---|
| `frame_selector` | `frame_registry` | Resolves the pack (user pin > brief suggestion > default) |
| `art_director` | `art_director.js` | Brand colors → an **accent-only** brand skin. Runs in parallel; joins at composition. Fail-open. |
| `storyboard_agent` | `storyboard.js` | Approved script → storyboard JSON (scene kinds, text slots, asset queries) |
| `scene_planner` | `layout_planner.js` | Deterministic per-scene **archetype typing** from purpose + on-screen text |
| `asset_planner` | `asset_planner.js` | LLM plans which images/videos to fetch and when to show them |
| `asset_search` | `asset_sources` + curation chain | The big one — acquisition, dedup, vision gate, Creative Director, Asset Director (§12) |
| `text_director` | `text_director.js` | Mines brief/script/site copy into **empty** scene text slots (subtext/bullets/emphasis/kicker). Runs before layout so a scene that gains bullets can become a feature grid. |
| `visual_layout_director` | `visual_layout_director.js` | Presentation spec: how many assets appear prominently, hero size, montage density, crop focus |
| `voice_agent` | `audio_planner` + `tts` + `vo_fit` | Per-scene VO synthesis, fitted to scene duration |
| `composition` | `pipeline.attemptLlmComposition` | Dispatches to one of the five render paths (§15) |
| `animation` | — | Animation report / enrichment |
| `timeline` | `pipeline.mixAudioIntoVideo` | Render + audio mix at scene offsets |
| `qa_agent` | `agents/qa_agent.js` | Samples rendered frames → vision verdict |
| `contrast_repair` | deterministic fix chain | **No LLM.** identity palette-snap + bg ground-veil + layout dedup/scrim + contrast recolor, re-run escalated |
| `repair` | LLM composer | One paid re-compose lap, composer path only |

**The QA routing decision** (`graph.js:1113-1156`) is the most consequential conditional in the codebase:

1. If QA returned **blockers** matching a fixable pattern (contrast/legibility, raw-photo clash,
   off-palette color, collision/overlap/duplicate) and the deterministic pass hasn't run → **`contrast_repair`**.
   This works on scene-kit and dedicated-composer films too, which otherwise shipped unfixed.
2. Else if QA failed **and** the LLM composer was used **and** laps remain **and** the composer's budget
   isn't dead → **`repair`** (a paid re-compose).
   Scene-kit comps deliberately get **no** paid repair lap: they are lint-clean by construction, so an
   LLM re-roll regresses as often as it helps while re-billing the priciest stage.
3. Else → `END`.

The deterministic repair increments `qaAttempts` but is **discounted** from the composer's lap budget
(`graph.js:1145`) so it can't eat a paid lap.

**Best-lap ledger** (`graph.js:1188-1203`): the graph tracks the highest-scoring QA lap and its video
snapshot. If the loop exhausts on a *worse* lap, it restores the better snapshot **and** surfaces that
lap's verdict — an earlier bug shipped best-lap video with last-lap verdict.

### 8.3 Cost continuity

`runProductionGraph` rebuilds the tracker with `UsageTracker.from(job.usage)` (`graph.js:1177`). Intake
(brief + script) already billed into the record; a fresh tracker here meant `markDone`'s usage write
**overwrote** those stages, so every finished job under-reported by the entire cost of its brief and
script.

---

## 9. Flow B — `/api/generate`

`services/pipeline.js:1324` `runJob()`. Single-shot, no script checkpoint. A **4-tier degradation ladder**:

```
1. Full:    storyboard → assets (plan + parallel fetch) → compose → lint (+repair) → render
2. Retry WITHOUT videos (keeps images), if render or compose failed
3. Retry WITHOUT any assets
4. Deterministic fallback composition (fallback.js) — must never itself fail
Then ALWAYS: if any audio flag was set, plan + fetch + mix it in.
```

The audio guarantee matters: a failure in the visual layer never loses TTS/music/SFX.

**Path unification.** `runJob` had drifted from the graph and produced worse films from the same input.
Ported across since:
- the **brief** stage (so a terse prompt gets the same directive richness, `pipeline.js:1352-1379`),
- the **Text Director** (`pipeline.js:1400-1407`),
- shared `directAssets`,
- the **Visual Layout Director**,
- visual-verify (QA + one deterministic repair lap) — the `progress:"qa"` stage.

Deliberately *not* ported: `scene_planner` (redundant with archetype typing) and `animation`
(low value on this path).

**Exports shared with the graph** (`pipeline.js:1748`): `withBudget`, `attemptLlmComposition`,
`composeWithThree`, `isAssetRich`, `mixAudioIntoVideo`, `fallbackQueriesFor`, `retimeScenesToVo`,
`contrastFixPass`. The graph owns ordering; `pipeline.js` owns the work.

---

## 10. The LLM layer

`services/openrouter.js` (546 lines) is the single LLM client. Everything goes through `chat()`,
which returns `{ text, tokensIn, tokensOut, model, costUsd }`.

### 10.1 The provider cascade

```
1. PRIMARY   KIE grok-4-5          — premium creative stages ONLY
                                     (Responses API — the only surface KIE exposes for Grok)
2. KIE ROUTE kie:<alias>           — resolved from config.llm.kieRoutes → KIE chat/completions
3. FALLBACK  OpenRouter primary    — config.llm.model (if it isn't itself an alias)
4. FALLBACK  OpenRouter secondary  — config.llm.modelFallback
```

### 10.2 The `kie:` alias mechanism

Any model id written **`kie:<route>`** resolves against `config.llm.kieRoutes` and dispatches to KIE
instead of OpenRouter. So `llm.model`, any `stageModels` entry, or `scriptEscalationModel` can name a
KIE-served model exactly the way it names an OpenRouter one. Routes inherit
`llm.primary.apiKey` / `KIE_API_KEY`.

```jsonc
"kieRoutes": {
  "gemini-3.6-flash": {
    "provider": "kie",
    "baseUrl": "https://api.kie.ai/gemini-3-6-flash-openai/v1",  // model goes in the URL PATH
    "api": "chat",
    "model": "gemini-3.6-flash"
  }
}
```

### 10.3 The house model policy (current)

| Tier | Stages | Model |
|---|---|---|
| **Hard / premium** (`llm.premiumStages`) | `brief`, `storyboard`, `script`, `composer` | **KIE grok-4-5** |
| **Everything else** | qa, vision, transcribe, vo_fit, all 5 directors, planners, screenshot QA, dressing | **KIE gemini-3.6-flash** |
| **TTS** | narration | **OpenRouter `openai/gpt-audio-mini`** — deliberately untouched |
| **Outage fallback only** | any stage, when KIE is down | OpenRouter `google/gemini-3-flash-preview` |

Grok is a **reasoning** model: output tokens include reasoning and are billed. That's exactly why the
premium tier is narrow — a trivial stage (a vo_fit tighten, a QA verdict) can burn 3k+ output tokens
where a flat model spends 300. `kieEnabled` (`openrouter.js:441`) therefore requires
`!model && stagePremium`.

**Gotcha:** `art_director`, `text_director` and `template_director` pass `model:` **explicitly**, so
they can never inherit `llm.model`. Their default lives in `config.js` as `FAST_STAGE_MODEL`
(route-aware, so a config without `kieRoutes` degrades to flash-lite rather than dying in `validate()`).

### 10.4 Transport specifics

- **SSE streaming** (`readKieSse`) is used when a stage timeout exceeds 150s. KIE's Cloudflare edge
  throws 524s on the big prompts (storyboard/composer); streaming dodges it. Verified: composer
  succeeded in 192s streamed where non-streamed died at 125s.
- **KIE returns transport errors as HTTP 200** with an in-body `{code,msg}`. The client detects this
  and falls through rather than returning empty text.
- **Retries:** transient KIE 5xx/524 get `KIE_ATTEMPTS` retries with linear backoff before falling
  through, because the OpenRouter fallback is often daily-limited.
- **`badCompletionReason`** guards Gemini's intermittent "lazy stop" — `finish_reason:"stop"` with a
  truncated/empty payload. Flagged retryable.
- **`json_lenient.extractFirstJsonObject`** handles models appending commentary after valid JSON in
  json mode: strip fences → straight parse → string-aware balanced-brace extraction.
- **`isModelFatal`** (bad model id, context overflow) escalates to the *fallback* model rather than
  collapsing the stage — retrying the same model can't recover, a different one can.
- **Budget probe** (`checkBudget`, `openrouter.js:523`): reads `/key` and `/credits`, takes the
  **larger** of per-key remaining and account balance (a key can report $0.004 remaining yet still draw
  from a funded account). 60s cache. `null` = "unknown, proceed".

### 10.5 Per-stage knobs

`maxTokens` (default 17288, composer 50000, storyboard 20384, vo_fit 96), `requestTimeoutByStage`
(composer 420000ms, storyboard 240000ms, …), `temperatureByStage` (composer 0.2, default 0.7),
`storyboardMaxRetries`, `composerMaxRetries`, `composerLintRepairs`, `promptCaching: true`.

---

## 11. Ingest subsystem

Three workers, run in parallel during Act 1.

### 11.1 Website (`services/ingest/website.js`)

Drives the **cached Chrome the HyperFrames renderer already downloaded** (no extra binary) via
puppeteer-core. Extracts:

- title, meta description, headings, body text,
- the **link map** (`job.website_pages`) — later fuel for the Screenshot Director,
- the OG image,
- a full-page screenshot,
- **dominant brand colors** — screenshot → ffmpeg rawvideo downscale → saturation-weighted quantize.
  No native image dependency; this is why `ffmpeg` is a hard requirement.
- the site's **own images** (`job.website_images`) → later become `source:"website-image"` assets.

`services/peekshot.js` is a fail-soft **enhancer** layered on top: PeekShot renders on managed infra and
returns a clean retina PNG (2732×1800 for a 1366×900@2x viewport) which is what gets framed as the
product hero. Any error/timeout just keeps the local screenshot. `inject_js` kills consent banners.

### 11.2 Blog (`services/ingest/blog.js`)

A blog post is a different animal from a marketing site — the film must be built from the **article's
argument**. Picks the `<article>`/`<main>`/densest text container, reads innerText + section headings,
then downloads the big inline images (og:image first) so they become first-class assets
(`source:"blog"`, trusted).

### 11.3 Reference video (`services/ingest/transcribe.js`)

1. ffmpeg extracts mono 16kHz wav
2. STT: local faster-whisper (`scripts/transcribe.py`) by default, or a hosted OpenAI-compatible endpoint
3. ffmpeg samples N evenly-spaced frames → a vision LLM writes a one-paragraph style summary
   (pacing, palette, energy) that steers the brief.

---

## 12. Asset subsystem

### 12.1 Acquisition order (`services/asset_sources/index.js`)

```
1. LOCAL DATABASE     asset_cache/index.json — previously fetched assets, keyword-matched
2. CURATED LIBRARY    asset_library/<pack>/<Topic>/… (OFF by default)
3. EXTERNAL PROVIDERS in config order, primary query then fallback queries
4. null               → caller degrades gracefully
```

Every successful external download is **validated with ffprobe** and **registered into the local DB**,
so the studio serves more from disk over time with zero network calls and zero rate-limit exposure.

### 12.2 Providers

| Provider | Media | Key | Notes |
|---|---|---|---|
| `pixabay_api` | images + video | yes | official API, 100 req/60s |
| `openverse` | images | **keyless** | openly-licensed |
| `pexels` | images + video | yes | |
| `pixabay_scrape` | images | **keyless** | puppeteer-core last resort; handles the Cloudflare "Just a moment" wait; uses CDN preview URLs (`_640` upgraded to `_1280`) |
| `iconify` | **SVG icons** | **keyless** | 200k+ icons; recolored to the pack accent via `?color=`; bypasses the ffprobe raster gate |
| `pixabay_bridge` | vectors + music + SFX | — | local headless-Chrome daemon on :3007 for what the official API doesn't serve. Always fail-soft. |

### 12.3 Query hygiene (`asset_sources/query_terms.js`)

Storyboard scene queries leak camera and motion direction — "camera pans rapidly crisp", "fast tight
macro shot". Fed to a stock **vector** search these return random junk (a cartoon tooth, a syringe).
`subjectQuery()` strips direction verbs, camera/edit terms, generic adjectives and fillers down to the
concrete subject nouns. **If no concrete noun survives, the caller skips the fetch** — a missing vector
beats an off-topic one.

### 12.4 The curation chain

Assets pass through up to five filters, each fail-open:

1. **`asset_clip.js`** — local CLIP (`Xenova/clip-vit-base-patch32`, ONNX) scores image pixels against
   the film's subject. No API cost. Fail-soft: if the package/model/runtime is missing, everything
   scores neutral.
2. **`asset_vision.js`** — one cheap flash-vision call per fetched web asset: "does this plausibly serve
   a film about `<subject>`?" **Curated picks, real screenshots and vectors are trusted and never gated.**
3. **`creative_director.js`** — reviews **every** asset on six dimensions (relevance, visualQuality,
   brandCompat, storytelling, motionPotential, templateCompat), approves/rejects/re-ranks, assigns each
   to a scene, ranks screenshots, and can trigger **one bounded top-up fetch** for an empty scene.
   Rejected web-stock files are deleted from disk.
4. **`asset_director.js`** — the technical call on kept assets: quality demotion (blurry/watermarked),
   **kind** correction (a raster logo must be *contained*, not cropped like a photo), **fit/focus** (a
   tall full-page screenshot pins to its hero, not its blank middle), and **effect** (a screenshot rises,
   an icon pops, a photo resolves from blur, a diagram draws in).
5. **`visual_layout_director.js`** — presentation: prominent count, hero size, montage density, crop.

**Known limitation:** `asset.sceneId` (per-scene placement) is honored only by the LLM remix composer.
`scene_kit` does *not* read it, so scene assignment is advisory on the default path — assets join the
general weaving pool.

### 12.5 Media demand accounting (`services/media_fill.js`)

An unfilled media slot does **not** render as a missing `<img>` — every composer draws a styled
placeholder `<div>`. `normalize.stripMissingAssets`, `cinematic_lint` and the post-render vision QA all
sail straight past it, because to them the frame looks deliberately designed.

The fix: `template_engine.buildFilm` stamps `data-media-demand` / `data-media-filled` per clip and
`data-media-slot` per box, and `media_fill.scanCoverage()` counts holes by **pure string parse** (no DOM,
no I/O). `template_engine.planMedia()` is the single source of truth for demand; `npm run test:media`
asserts it.

### 12.6 Taxonomy (`services/asset_taxonomy.js`)

Keyword-based (no model, deliberately — fast and deterministic) classification of the subject into a
product category, supplying `avoid` concepts (glamour/jewelry for SaaS), `prefer` style descriptors,
and `kindForPurpose()` (hook → hero photo, feature → product UI, proof → people).

---

## 13. Screenshot subsystem

Three sources, one gate.

1. **Ingest landing shots** — hero + two scroll crops of the site's landing page (§11.1).
2. **`screenshot_director.js`** — *topic-matched internal pages*. A scene narrating pricing showed a
   stock vector instead of the actual pricing page. This agent:
   - discovers internal pages from the ingest link map, else scrapes homepage anchors,
   - **RESCUE:** an auth-walled app domain (claude.ai) has no capturable pages — ask the LLM for the
     product's official *public* marketing site (claude.com), verify it live (200, no login form, brand
     present), and shoot there instead,
   - captures via PeekShot and **pins each shot to its matching scene**.
3. **`topic_shots.js`** — for films with **no website at all**. A plain topic prompt used to get zero
   screenshots ever. The rationale is measured, not theoretical: for "Kubernetes operator
   observability", Pixabay's best answers were fairy lights, flowers, and a car interior matched on the
   word "dashboard" — the Creative Director correctly rejected 8 of 11. A real screenshot of a real
   on-topic product site beats every one of those. Config: `topicShots.{enabled,max}`.

**The gate — `screenshot_qa.js`.** Screenshots are "trusted owner content" so they skip the stock
relevance gate — which meant a capture that came back as a 404, a Cloudflare bot-wall, a cookie-consent
modal or a blank half-render went straight into the film as a **full-screen hero shot**. This agent
runs one batched vision pass (chunks of 6) over every capture and drops the broken ones. Fail-open by
design: any error keeps the screenshot.

---

## 14. Audio subsystem

```
audio_planner (LLM)  →  audio_director (LLM)  →  fetch  →  TTS per scene  →  vo_fit  →  mix  →  captions
```

1. **`audio_planner.js`** — plans only the layers whose flag is enabled. Emits voice choice, music
   description, and per-moment SFX cues. `VALID_VOICES` is exported and reused by the route validator.
2. **`audio_director.js`** — *acts*, unlike the old rate-after-the-fact reviewer. Decides whether music
   and SFX are actually needed, curates the best-fitting bed and the SFX that land on real moments, and
   sets **voice-aware levels**. The voiceover script is never touched. Fail-open: any error returns the
   planner's plan unchanged, so the director can only improve the audio, never block a job.
3. **Sources** — `sfx_library.js` resolves the script's `sfx[]` names against the local
   loudness-normalized library (`assets/sfx/`, built by `scripts/build_sfx_library.js`) — deterministic,
   zero randomness. Unknown names fall back to nearest word-match, then a live Freesound search.
   `audio_sources.js` fetches music from Freesound API v2 (token auth, `preview-hq-mp3` needs no auth on
   the CDN) with Internet Archive as a music-only fallback. Per-video music variety comes from seeding
   the Pixabay index off the jobId.
4. **TTS — `tts.js`.** Currently **OpenRouter `openai/gpt-audio-mini`** (`audio.ttsProvider:"openrouter"`,
   which makes `tts.js:68` skip its KIE branch entirely). One narrator is pinned per film; each clip is
   normalized to −16 LUFS. The gpt-audio models ad-lib around loosely framed input, so the prompt is a
   hard READ-EXACTLY instruction and an ad-lib retake fires when the transcript drifts.
5. **`vo_fit.js`** — measures each synthesized clip with ffprobe; if it overruns its scene by >10%, asks
   the fast model **once** for a tighter line and re-synths. Fires once per scene, so up to 30 calls on a
   3-minute film.
6. **VO-driven retiming** (`pipeline.retimeScenesToVo`) — scene durations are adjusted to the *measured*
   VO length. This is why a 25s request renders as 28.1s.
7. **`audio_mix.js`** — ffmpeg mixer. The critical trick: a plain `amix=duration=first` + `-shortest`
   let a 3s TTS clip truncate the whole video to 3s. Instead it injects an `anullsrc` **silent track as
   the first amix input** sized to the requested duration, anchors `duration=first` to that, uses
   `-t durationSec` as the single authoritative length, and **never passes `-shortest`**. Music and SFX
   are ducked under the voice; a master limiter and −14 LUFS normalize finish it. Per-job
   `audio-report.json`.
8. **`captions.js`** — `.srt` from the approved script's VO plus measured clip durations. Each caption
   spans scene start → start + measured VO duration (clamped). Long lines split into ≤2 balanced chunks.
   **Burnt-in subtitles are opt-in** (`captions:true`) — users overwhelmingly dislike them on short promos.
9. **`script_overlay.js`** — a separate, always-on layer that renders ~80% of the narration as large
   animated display type, template-independent. It **suppresses the subtitle node** so the two never
   double up.

---

## 15. Composition subsystem

`pipeline.attemptLlmComposition` (`pipeline.js:933`) is the single dispatch point every path routes
through. Five destinations, in priority order:

### 15.1 The dispatch

```
if (remix === true)                      → LLM composer            (explicit premium outranks everything)
else if (pack has a "renderer" field)    → dedicated pack composer (subject to portrait/long-form guards)
else if (render3d)                       → three_composer
else                                     → scene_kit               (the default)
                                        ↘ fallback.js on total failure
```

Two guards can bounce a dedicated renderer back to scene-kit:

- **Portrait:** `portraitOk:false` and the job is 9:16 → scene-kit with that pack's styling.
- **Long form:** `longFormOk:false` and `durationSec > 75` (`LONGFORM_RENDERER_SEC`) → scene-kit. A sparse
  GSAP renderer past that length draws a handful of plates and leaves the rest blank.

### 15.2 Path 1 — `scene_kit.js` (3607 lines, the primary composer)

Builds a complete, lint-valid, showcase-grade composition **in code**. The doctrine:

> The **kit** owns structure + motion (guaranteed by code, so a budget model can never produce an
> overlapping/truncated mess). The **pack** owns style (colors/fonts/atoms). The **agents** own content
> (copy, archetype choice, asset selection), carried on the storyboard.

It is the codification of three hand-authored reference films into parameterized scenes; the extracted
grammar is documented in `server/docs/SHOWCASE-DNA.md`.

**Archetypes** (`scene_kit.js:1955-3173`), chosen by `archetypeFor(scene, idx, total, hint)`:

`archHook` · `archStat` · `archCta` · `archText` · `archFeatureGrid` · `archQuoteCard` ·
`archProofStats` · `archStrikeList` · `archScreenshotHero` · `archSplitVector` · `archAssetMontage`

Showcase-uplift additions: per-scene light sources, alternating push/pull camera, emphasis shine sweeps,
stat progress rings, the multi-stat proof row, screenshot callout annotations, the strike-list
differentiator scene.

Variety is salted by `seedKey: jobId` — re-running the same prompt produces a visibly different
composition. Per-scene entrance rotation (11-deep, max 3 repeats) and per-boundary cut rotation prevent
long films from looking repetitive.

**Ornament modules** (`scene_kit_*_ornaments.js`) supply per-family decorative vocabularies: bespoke,
charged, departures, editorial, hearth, ignition, papertales, sketchnote, terminal.

### 15.3 Path 2 — `template_engine.js` + the family composers

The problem it solves: scene-kit routes all skin-only packs through **one** shared archetype set, so
every pack draws the same furniture — the card row users recognise across unrelated films. A pack only
looks genuinely different if it owns its **scene grammar**. Authoring that 56 times is design work;
**re-implementing the render contract 56 times is how blank frames, dead seeks and black tails ship.**
So the contract lives in `template_engine.js`, once.

A family composer supplies only design:

```js
theme(manifest, brandSkin)   → palette/fonts (its own shape, passed through)
styleBlock(theme, land)      → CSS
SCENES = { … }               → the authored scene grammar
```

…and inherits from the engine: the seek-safe render contract, portrait layouts, asset weaving, media
demand stamps, `withDisplayCopy` (the COPY LAW — see §23), and the black-tail guard.

**Eight families:** `poster-loud`, `retro-terminal`, `editorial-quiet`, `dark-premium`, `bright-minimal`,
`cinema`, `story-handmade`, `charged`.

### 15.4 Path 3 — dedicated pack composers

Packs whose `pack.json` declares a `renderer` get a hand-written composer. Registered in
`PACK_RENDERERS` (`pipeline.js:835-885`). **The key is the `renderer` string, not the pack name:**

| Renderer key | Composer | `longFormOk` | Character |
|---|---|---|---|
| `genesis` | `genesis_composer.js` | ✅ | Flagship "Living World": parallax city, god-rays, birds, people, 8 beats, screenshot showroom. Brand-adaptive (takes `brandSkin`). |
| `momentum` | `momentum_composer.js` | ✅ | Kinetic launch film — 8 authored scene types, whip/zoom camera, HUD rail |
| `showcase` | `showcase_composer.js` | ✅ | Annotated product tour — drawn arrows/callouts, browser + phone frames. The most screenshot-forward pack; pairs directly with `topic_shots.js`. |
| `omelette` | `omelette_adapter.js` | ✅ | Renders the **original bundled template** from `public/omelette-templates` (which one comes from the manifest's `template` field), driving its own frame-exact seek contract |
| `flagship` | `flagship_composer.js` | ✅ | Three.js |
| `brightlife` | `brightlife_composer.js` | ✅ | Three.js |
| `blueprint` | `blueprint_composer.js` | ❌ | Blueprint Atelier — GSAP |
| `bloom-fable` | `bloom_composer.js` | ❌ | Bloom Fable — GSAP |
| `bauhaus-riot` | `bauhaus_composer.js` | ❌ | Bauhaus Riot — GSAP |
| `daybreak`, `organic`, `lantern`, `hype`, `posterpop`, `storyblocks`, `premiere` | respective `*_composer.js` | ✅ | Faithful ports of the bundled "omelette reel" films, built on `template_engine` |

The three GSAP composers marked ❌ are the ones the 75-second long-form guard actually bounces to
scene-kit; everything else declares `longFormOk: true`. Every entry currently declares
`portraitOk: true`.

**`template_director.js`** gives any composer exporting `TEMPLATE_SCENES` an editorial casting pass: an
LLM reads the storyboard + the pack's authored scene vocabulary + the asset inventory and returns, per
scene, the template scene type, slot copy shaped to that type's stated limits, and which asset lands in
which slot. A deterministic best-of brain (`scoreAsset`) always runs underneath, so turning the LLM off
costs casting nuance, never renderability.

### 15.5 Path 4 — `composer.js`, the LLM composer (opt-in)

Storyboard + asset list → `indexHtml` + `metaJson`, freehand. The system prompt
(`prompts/system_composer.md`, 672 lines) is augmented with the official HyperFrames **skills**
markdown — the same reference material the framework team gives agents via `npx skills add` — loaded
by `services/skills.js` (local `.agents/skills` first, GitHub raw as fallback).

Gated by `quickCheck` before it ever reaches lint:
- **Vector/sticker floors** — a minimum count of animated vector elements and pop-in stickers.
- **Raster-asset usage floor** — with N provided images, ≥min(2,N) *distinct* ones must appear as
  `<img>/<video>` src or CSS `url(...)`, else auto-reject with the exact placement menu and
  "NEVER draw an empty placeholder panel".
- **Anti-shrink** — the repair feedback anchors to the previous doc's char count as a **floor**, because
  weak models "fix" a lap by rewriting *shorter*, trading a satisfied gate for a broken one
  (vectors ↔ stickers ↔ image-usage whack-a-mole → exhaustion).

Exhaustion → scene-kit fallback is **correct degradation**: an empty-panel premium comp is worse than
an asset-weaving scene-kit film.

### 15.6 Path 5 — `three_composer.js`

WebGL/Three.js cinematic composer, opt-in via `render3d` ("▲ CINEMA 3D" in the UI). v3 is
html-in-canvas with CRT effects, grain, and pixelation cuts.

### 15.7 The safety net — `fallback.js`

Invoked only when every other attempt failed. **Must never itself fail.** Two modes:

- `buildAssetFallback` — a polished Ken-Burns slideshow of the real fetched images/video + a logo outro
  with a caption/title layer. Guarantees a failed LLM comp still ships a video that *uses* the user's
  assets instead of a contentless gradient.
- `buildProceduralFallback` — no assets: animated gradient + particles + text.

Both use only inline SVG, CSS gradients, system fonts and GSAP — no external fonts, no LLM calls, no fetch.

### 15.8 `enrich.js` — the deterministic enrichment layer

Applied to every composition before render. Fixes what prompt tuning plateaued on:

1. **Recolor dead grounds** — a flat undesigned near-black/near-white ground is replaced *in place* with
   a design-system gradient of the **same luminance** (dark→dark, light→light).
2. **Background bokeh** and a **vector/motion floor** — injects `#__kf_bg` + `#__kf_fx` (particles, rings,
   draw-lines) on every comp.

Critically, `cinematic_lint.js` runs its density checks on **enrich-stripped** HTML — otherwise the
injected layer would let every comp pass the layer-count checks for free.

---

## 16. Frame packs

80 packs under `frames/<name>/`. Each is a design system.

### 16.1 Files per pack

| File | Role |
|---|---|
| `pack.json` | **the single machine-readable manifest** — every render path reads it |
| `FRAME.md` | design tokens + composition rules (YAML frontmatter + prose). Injected **verbatim** into the composer system prompt as the authoritative design system: "atoms are sacred, composition is free". |
| `frame-showcase.html` | the canonical reference render |
| `preview.mp4` / `poster.jpg` | gallery hover preview (built by `scripts/build-previews.js`) |

### 16.2 `pack.json` schema (example: `blueprint-atelier`)

```jsonc
{
  "name": "blueprint-atelier",
  "renderer": "blueprint",          // → PACK_RENDERERS key; absent = scene-kit/family
  "vibe": "An engineering drawing of a film. …",   // fed to the brief's pack picker + the gallery
  "colors":     { "sheet": "#123659", "ink": "#EAF3FF", "amber": "#FFB84D", … },
  "fonts":      ["Alfa Slab One", "IBM Plex Mono"],
  "surface":    { "flat": false, "lightCinematic": false, "ground": "#123659" },
  "motion":     { "cut": "panel", "drift": 1.03 },
  "fx":         { "canvas": "grid" },
  "skin":       { "accents": [...], "extras": [...], "emphasisCss": "color:#FFB84D;" },
  "assets":     { "photoMod": "technical blueprint schematic linework night",
                  "iconStyle": "line", "keywords": [...], "prefer": ["vector","photo"] },
  "typography": { "display": "Alfa Slab One" },
  "camera3d":   { … },
  "textfx":     { … }               // per-pack entrance/emphasis/cut vocabulary
}
```

**Why the manifest exists** (`frame_manifest.js` header): a pack's identity used to be smeared across
~5 hand-maintained tables in 3+ files (`scene_kit` FLAT_PACKS / LIGHT_GRADIENT_PACKS / PACK_SKINS /
PACK_MOTION / fxModeFor, `pack_style` PACK_STYLE, `brief` PACK_VIBES, web PACK_LORE) plus FRAME.md
frontmatter. Adding a pack meant editing ~13 sites. `frame_manifest.validateAll()` runs at boot and
logs `N/N packs have a valid pack.json` — currently **80/80** (all 80 pack directories carry both a
`pack.json` and a `FRAME.md`; `frame_registry.listPacks()` returns 80).

### 16.3 Supporting modules

- **`frame_registry.js`** — reads packs **live** from disk (no restart needed to add one); `resolvePack()`
  handles `"auto"` and unknown names.
- **`pack_families.js`** — groups packs by how they *read on screen*, so the auto-picker can force
  **cross-family** variety. Pack-name rotation alone kept landing a run of SaaS films in the same visual
  family. Fail-open: an unlisted pack is classified from its vibe text, else becomes its own family.
- **`pack_style.js`** — `photoMod` / `iconStyle` / `keywords` per pack for asset biasing.
- **`fonts/pack_fonts.js`** — base64 data-URI `@font-face` for pack display faces (~193KB inlined). This
  exists because the renderer resolved no webfonts, so every pack's headline silently rendered in a
  plain sans — the "typography eraser". System faces (Inter, Georgia) are deliberately absent.

---

## 17. Quality gates and repair

The gate stack, in the order a composition passes through it:

| # | Gate | Kind | Catches |
|---|---|---|---|
| 1 | `composer.quickCheck` | static regex | vector/sticker/asset-usage floors (LLM path only) |
| 2 | `normalize.js` | deterministic rewrite | mechanical lint violations that are 100% safe to fix in code — saves an LLM repair lap |
| 3 | `hyperframes lint` (`validator.js`) | external | **time + track validity**: unique tracks, opacity-only hidden states, hard kills, finite repeats, object-fit cover |
| 4 | `hyperframes inspect` | external | **space**: overlap/offscreen |
| 5 | `runtime_check.js` | headless Chromium | the composition actually **runs** — no uncaught page error, and `window.__timelines["vid"]` is registered. A comp can pass every static check and render a **blank video** because its GSAP threw. |
| 6 | `cinematic_lint.js` | static, on enrich-stripped HTML | the **ceiling**: ≥3 distinct visual layers per scene, a camera move, kinetic word-stagger headline, a reactive beat, an ambient layer, real gradients. Distinguishes "broadcast-grade" from "animated slideshow". |
| 7 | `contrast_check.js` | Chromium + WCAG 2.1 | unreadable text (ports HyperFrames' own contrast diagnostic onto our pinned engine) |
| 8 | `identityGate` (`pipeline.js:566`) | hue math | palette drift — a saturated hex >40° of hue from every pack token |
| 9 | `av_align.js` | text compare | **does each scene SHOW what it SAYS** |
| 10 | `qa_agent.js` | vision LLM | samples rendered frames → structured verdict with severity-tagged issues |

### 17.1 The deterministic fixers

Detection without repair is worthless, so each detector has a code-only fixer. **No LLM in any of these:**

| Fixer | Repairs |
|---|---|
| `contrast_fix.js` | rewrites the offending element's color to the nearest readable **on-palette** token; when no solid color reaches the needed ratio, drops a solid scrim chip behind it. Edits only inline `style`/`-webkit-*` on existing elements — never clips. |
| `identity_fix.js` | snaps each off-palette color to the nearest pack token that keeps the hue, then global-replaces. Reuses the exact hue math `identityGate` measures with. |
| `layout_fix.js` | renders in Chromium, samples settled frames, groups visible text by content → hides redundant duplicates; flags text sitting on a busy image with no solid backing → drops a scrim chip. **Safe-only: it hides or scrims, it never moves a box.** |
| `bg_harmonize.js` | finds unscrimmed full-bleed background photos (the LLM path can place a raw `<img object-fit:cover>` with no scrim, so the photo's raw hues fight the palette) and lays a ground-veil. Skips heroes, already-scrimmed images, and SVGs. |

These compose into the **escalated fix chain** the `contrast_repair` graph node runs.

### 17.2 The QA agent (`agents/qa_agent.js`)

Samples frames from the **rendered** video and shows them to the vision model alongside
manifest-driven, concrete identity expectations — the pack's display font, its ground lightness, its top
three accents. It exists because *every* failure shipped during development (empty scenes, offscreen
content, unreadable text) was **visible in frames and invisible to lint**.

Recurring blocker classes it catches: stat-label corruption, alpha-killed contrast, portrait squeeze,
decoration occluding text, groundhog set (cross-frame sameness), palette-clashing/off-topic photos.

### 17.3 `quality_report.js`

Pure aggregator, makes no model calls and never throws. Gathers contrast fixes
(`contrast-report.json`), audio loudness (`audio/audio-report.json`), screenshot QA
(`screenshot-qa.json`), asset quality + template fit (the Creative Director review), and the vision
verdict into one `qualityReport` the job record carries and the UI renders.

---

## 18. Rendering

`services/renderer.js` shells out:

```bash
npx --yes hyperframes@0.6.120 render --output ./renders/out.mp4 --quality <q> --workers <n>
```

run with `cwd = jobs/<jobId>/`, then moves the MP4 to `public/videos/<jobId>.mp4`.

- **Version is pinned** (`config.render.hyperframesVersion`). An unpinned `latest` can resolve to a
  version whose tarball hasn't propagated → `ETARGET`; a bad pin produced all-0-frame renders.
- **`spawnCompat`** (`spawn_compat.js`) resolves a genuine Windows bind: Node ≥18.20 throws `EINVAL`
  spawning a `.cmd` without a shell (CVE-2024-27980), but Node ≥22.14 emits `DEP0190` when an args
  *array* is combined with `shell:true`. Resolution: when a shell is required, quote each arg ourselves
  and pass **one command string**.
- **`windowsHide: true`** keeps the cmd/conhost chain off the desktop heap — the heap whose exhaustion
  produces `0xC0000142` crashes.
- **Watchdog:** `max(watchdogMinSec, duration × watchdogMultiplier) + watchdogBufferSec`, stretched
  proportionally when a degraded retry runs with fewer workers. Accommodates the ~107 MB Chromium
  download on a fresh deploy's first render. Kills the whole process tree (`killTree`).
- **Progress** is surfaced at 10% increments by parsing `N% Capturing frame` from stderr, so long renders
  don't go silent.
- **Retry ladder:** non-zero exits retry; a persistent OOM signature drops `renderWorkers` to 1.

---

## 19. Storage, retention, the janitor

`services/janitor.js`, every 10 minutes:

1. Delete `jobs/<id>/` older than 1 hour (working dirs are debug-only once done).
2. Delete `public/videos/*.mp4` older than `videoTtlHours` (168h = 7 days).
3. If `public/videos/` exceeds `maxStorageMb` (2000), delete oldest until under cap.

`server/showcase/` is **never** swept — it holds the hand-authored reference compositions.

**The ghost-video problem:** the janitor deletes MP4s but job records persist, so the gallery 404-stormed
on deleted files. Fixed read-side with `db.videoUrlIfExists()` (`db.js:38`) which gates `video_url` at
read time, plus an `onError` gradient fallback in the UI.

---

## 20. Authentication

Deliberately minimal, ported from a prior project's pattern.

- **`auth/store.js`** — file-based users + OTPs in `auth-store.json`. **Note:** on an ephemeral host
  (Render free/standard disk) this resets on redeploy. Accepted trade-off for "no new infra"; swap to a
  real DB by reimplementing this module's API.
- **`auth/helpers.js`** — `bcryptjs` (pure JS, no native build, so Render's Docker and Windows behave
  identically), 6-digit OTP, JWT in an **httpOnly cookie** named `kf_auth`. Secret from `SECRET_KEY`.
- **`auth/middleware.js`** — `requireAuth` (401) and `optionalAuth` (annotate only). Only `/api/auth/me`
  is guarded.
- **`auth/mailer.js`** — nodemailer/Gmail using `GMAIL_USER` + a Gmail **App Password**. If absent,
  sending is a **no-op that logs** — the flow still works in dev, with the OTP printed to the console.
  (This is the `[auth] GMAIL_USER/GMAIL_PASS not set` line on every boot.)

---

## 21. Cost accounting and observability

### 21.1 `services/usage.js`

A `UsageTracker` per job records LLM tokens per stage, TTS chars/tokens, and external API call counts
(Pixabay, Freesound, Internet Archive, HyperFrames render/lint, OpenRouter TTS).

**Each stage is priced by the model it actually ran on**, resolved from `premiumStages` + `stageModels`
— `modelForStage()` mirrors the dispatch logic locally to avoid a require cycle. `MODEL_PRICING` is a
per-model $/1M table.

**The KIE credit rate is measured, not assumed.** KIE bills in credits (`credits_consumed` on every
response) at **$0.005/credit** (200 credits = $1, cross-checked against KIE's published examples —
Nano Banana image = 4 credits = $0.02). Solving from two live calls with opposite token mixes gives
~90 credits/1M input and ~441/1M output → **$0.45 in / $2.21 out** for gemini-3.6-flash. Verified against
a third call. The prior $1.50/$7.50 placeholder overstated real spend by ~3.3×.

`UsageTracker.from(snapshot)` rehydrates a persisted bill so a two-phase project job **continues** the
same bill instead of opening a new one.

**Measured reality** (job `gdn63zcz0k`, 25s → 28.1s film, 2026-07-30): 10 LLM calls, 11.31 KIE credits =
$0.0565 actual; tracker independently estimated $0.056569 from tokens. Plus TTS $0.0064.
**Total $0.063, 7.1 min wall.**

Cost history for context: June (grok-everything) $0.26–1.14/video → early-July (scene-kit-lean)
$0.008–0.015 → mid-July $0.05–0.14. The growth was the **director-agent fleet**, not the composer — and
those agents *are* the quality.

### 21.2 Logging

`services/logger.js` — levels gated by `LOG_LEVEL`, ISO-8601 timestamps, `logger.child({jobId, tag})`
for per-job correlation so one job's lifecycle is greppable across concurrent renders. Optional
`LOG_JSON=1` JSON-lines output. Backward compatible: still writes to `console.{log,warn,error}` so the
existing `[tag]` grep patterns keep working.

Useful greps: `[llm]` (dispatch decisions), `[kie]`/`[openrouter]` (per-call results with tokens +
credits), `[pipeline]`, `[agents]`, `[renderer]`, `[qa]`, `[contrast]`.

---

## 22. Development workflow and hazards

### 22.1 Run it

```bash
cd server
npm run dev        # → node scripts/dev-watch.js
```

### 22.2 ⚠️ NEVER use `node --watch`

`scripts/dev-watch.js` exists specifically because of this. On Windows, libuv's directory watcher also
fires on **last-access-time** updates (`FILE_NOTIFY_CHANGE_LAST_ACCESS`), and this server lazy-requires
its own modules at runtime — so merely **reading** `src/` made `node --watch` restart in storms, killing
in-flight render jobs. `dev-watch.js` stats each event's file and restarts only when **mtime/size
actually changed**.

### 22.3 Other hazards learned the hard way

- **Editing `server/src` kills in-flight jobs.** dev-watch restarts the child. Check for running jobs first.
- **`config.json` is gitignored AND unwatched.** Config edits require a manual restart. (Safe with jobs
  in flight — they won't be killed.)
- **dev-watch's `fs.watch` handles go stale after ~24h.** If saves stop triggering restarts, restart the
  supervisor.
- **The web app is BUILT.** `cd web && npm run build` after editing `web/src`, or the browser keeps old
  defaults. Output goes to `server/public/dist` (also unwatched).
- **PowerShell `Get-Content` mojibake** — use the Read tool, not `cat`, for files with non-ASCII.

### 22.4 Test and audit harnesses

`server/scripts/` holds per-composer harnesses (`bauhaus-harness.js`, `blueprint-harness.js`,
`momentum-harness.js`, `shots-harness.js`, `blog-harness.js`, …) that drive one composer in isolation
without paying for a full render. `graph.js` exports `__test_assetSearchAgent` for the same reason —
it's the node where acquisition, gap-fill and curation meet.

---

## 23. Known issues and failure modes

### 23.1 Open

| Issue | Detail |
|---|---|
| **Media density** | Measured on job `gdn63zcz0k`: 13 assets approved, only the **3 screenshots** placed — all 9 Pixabay photos went unused. Root cause is placement, not supply: family scene grammars declare `media: []` on 5–6 of 7 scene types. |
| **Empty placeholder plates** | A white-bordered empty rectangle is visible for ~1s before each screenshot fills (~8s and ~17s in that job). This is exactly the styled-placeholder `<div>` `scanCoverage` exists to detect — now visible rather than silent. |
| **Dead transition frames** | 3–4 near-empty frames per film where the outgoing scene has left and the incoming card hasn't faded in. |
| **`asset.sceneId` ignored by scene-kit** | Per-scene assignment and Creative-Director top-up placement are advisory on the default path. |
| **QA skipped on deterministic path** | `qa.skipped:true` for scene-kit films (the 1-lap cap), so none of the above gets a QA lap. |
| **Low-score screenshots approved** | A notion.so capture that returned an "an error occurred" page scored 27/100 and was still *approved* at background prominence. It didn't reach the film — but the **placement cap** saved it, not a gate. |
| **`external.openrouter_chat` mislabel** | The external counter names every chat call `openrouter_chat` even when it went to KIE. Cosmetic. |
| **`posterpop_composer` one-way drift** | Same hardcoded camera drift bug that was fixed in story-blocks. |
| **Landscape image cards** | Desktop screenshots crop badly into 9:16 slots. |

### 23.2 Classic bugs already fixed (keep these in mind — they recur)

- **A/V copy misalignment** — films showed pack boilerplate while the narrator read the real script. The
  script schema has no `headline`; builders read it and fell back to demo copy. Fixed with
  `template_engine.withDisplayCopy` + a composer COPY LAW + the `av_align.js` gate (25–50% → 100%).
  **Gotcha:** compiled `s.X || demo` fallbacks need `" "`, not `""`, to suppress demo copy.
- **The typography eraser** — no webfonts resolved; every pack's headline rendered in a plain sans. Fixed
  with base64 `@font-face`.
- **Cut-layer blank** — a solid-colour hold went blank because GSAP's `immediateRender` fired on a
  cut-layer exit `fromTo`. Fixed with `immediateRender:false`.
- **The 3-second video** — `amix=duration=first` + `-shortest` truncated a film to its shortest TTS clip.
- **The black void** — flat dark ground + one tiny caption passing every structural gate. Fixed by
  `enrich.js`.
- **Silent source-file clobber** — 27 `server/src` files were untracked (never `git add`-ed, not ignored),
  so parallel work overwrote them with no diff. Committed on this branch (`d19e24b`).
- **GSAP seek suppresses `onUpdate`** — probe with `time(t, false)`.
- **GSAP clobbers SVG `rotate` attributes** — use `svgOrigin`.
- **Scene ids are number OR `"s2"`** — always normalize.

---

## 24. How to extend it

### 24.1 Add a frame pack

1. `node scripts/new-pack.js <name>` scaffolds the folder.
2. Write `frames/<name>/pack.json` (§16.2) and `FRAME.md`.
3. Bundle any non-system display font into `src/fonts/pack_fonts.js` as base64 — otherwise the
   typography eraser silently strips it.
4. Optionally add ornaments in a `scene_kit_*_ornaments.js` module.
5. For a dedicated look, write a composer and register it in `PACK_RENDERERS`; otherwise leave `renderer`
   out and the pack rides scene-kit or its family.
6. Validate: `npm run check:packs`, `npm run audit:identity`, `npm run audit:portrait`.
7. Build a preview: `node scripts/build-previews.js`.

The registry reads packs **live**, so no restart is needed to see it in `/api/frames`.

**Design note:** packs must differ in **animation**, not just color. The `textfx` manifest exists for
exactly this (9 entrances incl. char-split, 6 emphasis modes, per-pack cuts and canvas FX).

**Landscape ornament gotcha:** ornament columns must avoid the kicker band at y ≈ 0.28–0.65.

### 24.2 Change the LLM for a stage

Edit `config.json` only:
- `llm.stageModels.<stage>` → an OpenRouter id, a `kie:<route>` alias, or the sentinels `"default"`/`"fast"`.
- To add a KIE-served model, add a `llm.kieRoutes` entry — **no code change**. The model goes in the URL
  **path**, not the body.
- Then **restart** (config.json is unwatched).

Boot validation will reject a dangling alias or an all-KIE config.

### 24.3 Add an asset provider

1. Create `services/asset_sources/<name>.js` exporting `search({query, type, orientation, limit})`.
2. Register it in the `PROVIDERS` map in `asset_sources/index.js`.
3. Add it to `config.assetProviders.order` and its key block.

Downloads are auto-validated with ffprobe and auto-registered into the local cache.

### 24.4 Add a pipeline stage

1. Write the service, following the house conventions: a **file header explaining why it exists**, a
   config/env flag, and **fail-open** error handling.
2. Wire it as a node in `agents/graph.js` (with edges expressing its real data dependencies) **and** into
   `pipeline.runJob` — otherwise the two paths drift, which is the single most common source of
   "why does /generate look worse".
3. Add it to `usage.js` pricing if it makes LLM calls.
4. Add a harness in `server/scripts/` so it can be driven without a full render.

---

## 25. Glossary

| Term | Meaning |
|---|---|
| **Frame pack** | A design system: palette, fonts, motion vocabulary, ornaments. 80 installed. |
| **Composition** | The single self-contained HTML document HyperFrames renders. |
| **Scene kit** | The deterministic code-driven composer — the default path. |
| **Family** | A shared authored scene grammar covering several packs, on `template_engine`. |
| **Dedicated renderer** | A per-pack hand-written composer, selected by `pack.json` `renderer`. |
| **Remix / premium** | The opt-in LLM composer path. |
| **Archetype** | A scene layout type in the scene kit (`archHook`, `archStat`, …). |
| **Storyboard** | Scene-by-scene JSON: kind, text slots, asset queries, timing. |
| **Brief** | The LLM's structured understanding of intent: subject, tone, goal, key messages, brand colors. |
| **Script** | The user-editable production script: per-scene voiceover, duration, SFX. |
| **Director** | An agent that *acts* on a dimension (art/text/asset/audio/screenshot/visual-layout/template). |
| **Gate** | A check that can bounce a composition for repair. |
| **Fail-open** | On error, keep going with the un-improved input. Every director is fail-open by design. |
| **The seek contract** | The requirements that let HyperFrames drive a GSAP timeline frame-by-frame. |
| **Enrichment** | `enrich.js` — the deterministic visual floor applied to every comp. |
| **Best-lap ledger** | Shipping the highest-QA-scoring repair lap, not the last one. |

---

## Appendix A — Reading order for a new engineer

1. `server.js` — 207 lines, the whole wiring.
2. `src/config.js` `validate()` — what the system refuses to start without.
3. `src/db.js` `shape()` + `insert()` — the data model.
4. `src/agents/graph.js:1052-1162` — the graph and the QA routing decision.
5. `src/services/pipeline.js:933-1030` — `attemptLlmComposition`, the composition dispatch.
6. `src/services/openrouter.js:410-513` — the provider cascade.
7. Any one family composer + `template_engine.js` — the render contract.
8. `src/services/scene_kit.js` header + `archetypeFor` — the default composer's doctrine.

## Appendix B — Design principles the codebase actually follows

1. **Deterministic beats generative wherever the output is checkable.** Every LLM gate has a code-only
   fixer, because detection without repair ships broken films.
2. **Fail-open everywhere on the enhancement path.** A director that errors returns its input unchanged.
   A gate that can't run passes. Nothing optional may ever block a render.
3. **File headers explain *why*, not *what*.** Nearly every module opens with the bug or limitation that
   justifies its existence. This is the codebase's most valuable documentation — read them.
4. **One source of truth per concern.** `pack.json` for identity, `planMedia()` for media demand,
   `usage.js` for cost, `template_engine` for the render contract.
5. **Measure, don't assume.** The KIE credit rate, the ETA constants, the asset-quality thresholds, the
   long-form renderer cutoff — all derived from observed runs.
6. **Both paths or neither.** A feature added to the graph but not to `runJob` becomes a silent quality
   regression on the other endpoint.
