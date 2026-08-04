# Video Gen — Prompt → Video on Elastic Beanstalk

Node.js service that takes a text prompt + duration and returns an MP4.
LLM: KIE AI Gemini 3.5 Flash (primary) with OpenRouter MiniMax M3 (fallback). Renderer: HeyGen HyperFrames (local, on-box).
Target: AWS Elastic Beanstalk **Node.js 22 on Amazon Linux 2023 (ARM64)**, `us-east-1`, `t4g.xlarge`.

---

## What you end up with

- Public URL (`https://<env>.<region>.elasticbeanstalk.com`) serving a small UI.
- `POST /api/generate` with `{prompt, duration, orientation, fps}` → `{jobId, statusUrl}`.
- `GET /api/jobs/:id` → status + eventual `videoUrl` (served at `/videos/<id>.mp4`).
- **3 videos rendering in parallel** on a single t4g.xlarge (4 Graviton2 vCPUs, 16 GB RAM).
- Self-healing: retries, lint repair, fallback composition, crash recovery, disk janitor.

---

## Instance choice — why t4g.xlarge

| Spec | Value |
|---|---|
| CPU | 4 vCPU AWS Graviton2 (ARM64) |
| RAM | 16 GB |
| Architecture | `arm64` — requires the **ARM EB platform variant** |
| Cost (on-demand us-east-1) | ~$98/mo |
| Cost (1-year Reserved, no upfront) | ~$62/mo |
| Burstable | Yes — uses CPU credits, Unlimited mode by default |

**Burstable caveat:** t4g.xlarge has baseline 40% CPU + unlimited bursting via CPU credits (extra charges apply if sustained bursts drain the credit bucket). For sustained 24/7 rendering at full tilt, upgrade to `c7g.xlarge` (~$125/mo, non-burstable, 4 dedicated Graviton3 vCPU). For mixed/intermittent rendering, t4g is fine.

## Parallel-render tuning (applied in this repo)

Set via EB env vars in `.ebextensions/01_options.config`:

| Variable | Value | Effect |
|---|---|---|
| `JOB_CONCURRENCY` | `3` | Up to 3 jobs run in parallel through the queue |
| `RENDER_WORKERS` | `1` | Each render is single-threaded frame capture |
| `RENDER_QUALITY` | `draft` | Fast encode pass; good enough for v1 |

Rule of thumb: `JOB_CONCURRENCY × RENDER_WORKERS ≤ vCPU − 1` (leaves one core for Node + FFmpeg orchestration). With 3×1 = 3 on a 4-vCPU t4g.xlarge, you have 1 vCPU of headroom. Raising these risks thrashing under load.

---

## Project layout

```
.
├── server.js                       Express entry
├── config.json                     All tunables + API key (kept out of git)
├── package.json                    Node deps (Hyperframes invoked via npx)
├── src/
│   ├── config.js                   Load + validate config.json, freeze, env overrides
│   ├── db.js                       In-memory job store + atomic JSON persistence
│   ├── routes/{generate,jobs,health}.js
│   ├── services/
│   │   ├── openrouter.js           LLM client: KIE (primary) → OpenRouter (fallback)
│   │   ├── storyboard.js           Pass 1: prompt -> JSON storyboard
│   │   ├── composer.js             Pass 2: storyboard -> HTML + meta.json
│   │   ├── validator.js            Runs `npx hyperframes lint`
│   │   ├── renderer.js             Runs `npx hyperframes render` + watchdog
│   │   ├── fallback.js             Deterministic emergency composition
│   │   ├── janitor.js              Disk cleanup every 10 min
│   │   └── pipeline.js             Orchestrator (all of the above)
│   └── prompts/
│       ├── system_storyboard.md    Hardened Pass 1 prompt
│       └── system_composer.md      Hardened Pass 2 prompt w/ schema
├── public/
│   ├── index.html  app.js  styles.css      Frontend
│   └── videos/                     Rendered MP4s (gitignored)
├── jobs/                           Per-job working dirs + state.json (gitignored)
├── .ebextensions/01_options.config Instance type, env, health check path
└── .platform/
    ├── hooks/prebuild/
    │   ├── 00_system_deps.sh       FFmpeg static (arch-aware) + Chromium libs + 2GB swap
    │   ├── 01_fonts.sh             Roboto
    │   └── 02_warm_hyperframes.sh  Pre-cache npx hyperframes as webapp user
    └── nginx/conf.d/proxy.conf     Body size + timeouts
```

---

## Prerequisites

- AWS account with Elastic Beanstalk + EC2 permissions.
- Region: **us-east-1** (hardcoded assumption in this README; change as needed).
- A fresh OpenRouter API key (`sk-or-v1-…`) in `config.json` under `llm.apiKey`.

---

## Deploy (Windows → EB, zero-SSH)

### 1. Zip the project

```powershell
cd path\to\video-gen
powershell -Command "Compress-Archive -Path * -DestinationPath deploy.zip -Force"
```

(If Windows PowerShell produces backslash paths that break on Linux unzip, use the .NET `ZipFile::CreateFromDirectory` helper — same approach we used for `deploy-v5.zip`.)

### 2. Create the EB environment — **must be the ARM platform**

1. AWS Console → **Elastic Beanstalk** → **Create application**.
2. Application name: `video-gen`.
3. Platform: **Node.js** → version **Node.js 22 running on 64bit Amazon Linux 2023 — arm64**.
   ⚠️ This is critical. The `x86_64` variant will fail on t4g.xlarge because ARM binaries and shared libs differ.
4. Application code: **Upload your code** → select `deploy.zip`.
5. Preset: **Single instance (free tier eligible)** — change instance type to **t4g.xlarge** in *Configure more options → Capacity*.
6. Click **Create environment**.

First boot takes ~5–8 minutes (prebuild installs ARM FFmpeg + Chromium libs + warms hyperframes).

### 3. Verify

- Open the environment URL.
- The UI should load. Hit `/health` — expect `{"ok":true,...}`.
- Submit a test: prompt "Explain photosynthesis in a punchy way", duration 15, orientation horizontal.
- Watch the status card: expect `queued → storyboard → composing → rendering → done`.
- Submit 3 at once — they should all run in parallel.

---

## Configuration (`config.json`)

| Key | Default | Meaning |
|---|---|---|
| `server.maxDurationSec` | 150 | Hard cap on requested duration |
| `server.rateLimitPerHourPerIp` | 5 | Per-IP throttle |
| `server.dailyJobCap` | 100 | Global daily cap |
| `server.videoTtlHours` | 24 | How long to keep rendered MP4s |
| `server.renderQuality` | `draft` | `draft` (fast) or `default` (slow, higher quality) |
| `server.watchdogMultiplier` | 8 | Watchdog = duration × this + buffer |
| `server.jobConcurrency` | 1 | Parallel jobs. Overridden via `JOB_CONCURRENCY` env. |
| `server.renderWorkers` | 1 | Parallel frame capture. Overridden via `RENDER_WORKERS` env. |
| `server.maxStorageMb` | 500 | Total videos directory cap |
| `llm.primary.model` | `gemini-3-6-flash` | KIE model for every non-heavy stage |
| `llm.primary.stageModels` | `{composer, storyboard: grok-4-5}` | Per-stage KIE overrides — the heavy stages |
| `llm.primary.fallbackModel` | `gemini-3-6-flash` | Second KIE model, tried once if the first fails |
| `llm.primary.models` | *see config* | Per-model `{baseUrl, protocol}` — **required** (see below) |
| `llm.primary.apiKey` | *in file* | KIE AI key. Serves **every** LLM stage. |
| `llm.apiKey` / `llm.baseUrl` | *in file* | OpenRouter — **voiceover + budget probe only**, no LLM stage |
| `orientations` | horizontal/vertical/square | Canvas dimensions |

**Model cascade per LLM call (KIE only):** `primary.stageModels[stage]` → `primary.fallbackModel` → throw, and the stage uses its deterministic fallback. OpenRouter is never used for an LLM call.

**Why `primary.models` exists:** KIE does not serve both models the same way.
- `gemini-3-6-flash` → `https://api.kie.ai/gemini-3-6-flash-openai/v1` — OpenAI `chat/completions` (`protocol: "openai"`). Handles vision.
- `grok-4-5` → `https://api.kie.ai/grok/v1` — xAI **Responses** API (`protocol: "responses"`): messages go in `input`, the ceiling is `max_output_tokens`, JSON mode is `text.format`, and the reply is an `output[]` array. There is no `grok-*-openai/v1` slug; it returns 422.

KIE returns transport errors as HTTP 200 with an in-body `{code,msg}`; `openrouter.js` detects this on both protocols rather than silently returning empty text.

EB env vars that override at runtime (all handled in `src/config.js`):
- `KIE_API_KEY` (overrides `llm.primary.apiKey`)
- `OPENROUTER_API_KEY` (overrides `llm.apiKey` — TTS/voiceover only)
- `PORT`
- `JOB_CONCURRENCY`
- `RENDER_WORKERS`
- `RENDER_QUALITY`

---

## Expected performance on t4g.xlarge

From benchmarks of similar workloads on Graviton2 + EPYC-class hosts:

| Scenario | Estimated time |
|---|---|
| Single 30 s horizontal video | ~2–4 min |
| Single 30 s vertical (1080×1920) video | ~3–5 min |
| 3 parallel 30 s videos | ~4–6 min each (soft throttle under load) |
| Single 150 s vertical video | ~15–25 min |

Your previous 30 s vertical on t3.medium took 547 s (~9 min). On t4g.xlarge with 2× the cores and better Graviton2 per-core perf, expect ~40–60% of that.

---

## Operational notes

- **State is ephemeral across deploys.** EB replaces `/var/app/current`, so old videos are lost on redeploy. Janitor enforces the 24-hour TTL anyway.
- **Rate limits are IP-based.** Behind the EB ALB, `X-Forwarded-For` carries the client IP (handled in `src/routes/generate.js`).
- **Render concurrency.** `JOB_CONCURRENCY=3` with `p-queue`. Extra requests queue in `jobs/state.json`.
- **Logs:** `eb logs` from the EB CLI, or EB console → Logs → Request logs.
- **LLM cost:** primary KIE Gemini 3.5 Flash bills $0.45 / $2.70 per 1M input/output tokens (~$0.01–0.05 per video depending on length); visible per-job in the state file (`llm_tokens_in`, `llm_tokens_out`). Rare OpenRouter fallbacks bill at MiniMax rates (slightly higher) — cost figures are then approximate.
- **Big / lengthy requests.** The composer can take 60–120 s for long videos (large HTML output). Per-call LLM timeout is `llm.requestTimeoutMs` (180 s) — comfortably above observed latency, and below the 480 s `stageBudgetSec`. The stage-budget abort is threaded into the LLM call, so a timed-out or over-budget composition is cancelled promptly (not orphaned) before falling back to OpenRouter — important when 3 jobs render in parallel.

---

## Rotation checklist before going live

- [ ] Generate a fresh KIE AI key and paste into `config.json` `llm.primary.apiKey` **or** set env var `KIE_API_KEY` in EB console (preferred).
- [ ] Generate a fresh OpenRouter key at https://openrouter.ai/keys (still required — it powers the LLM fallback **and** TTS).
- [ ] Paste it into `config.json` `llm.apiKey` **or** set env var `OPENROUTER_API_KEY` in EB console (preferred).
- [ ] Keep `config.json` out of git (already in `.gitignore`).
- [ ] Do a test render end-to-end before giving out the URL.

---

## Website screenshots — capture providers

Two capture paths, and the split matters:

| | Provider | Gives you |
|---|---|---|
| **Primary** | local headless Chrome (`ingest/website.js`) | screenshots **+** DOM text, headings, brand colours, computed typography, harvested brand assets, and capture-time obstruction geometry |
| **Rescue** | PeekShot hosted API (`ingest/peekshot.js`) | screenshots only |

The local path stays primary because most of what intake needs is DOM signal, not pixels.
PeekShot runs **only when the primary returns no usable screenshots** — no Chrome, an
SSRF/connection pin, a page that never settles — which otherwise ships a film with no
product imagery at all. It natively blocks cookie banners and ads, the single most common
capture defect here.

```bash
# server/.env  (gitignored)
PEEKSHOT_API_KEY=…            # from peekshot.com
PEEKSHOT_PROJECT_ID=          # optional — the account's first project is used when unset
SCREENSHOT_PROVIDER=auto      # auto (default) = local, rescue with PeekShot
                              # local   = never call it
                              # peekshot = always capture with it as well
PEEKSHOT_MOBILE_SHOT=0        # 1 = also take a phone-shaped capture (2× the credits)
```

Notes worth knowing before relying on it:

- **Every capture costs a credit** and is asynchronous. Measured on the live queue:
  ~15 s at best, but individual requests have sat queued past 100 s while later ones
  finished. `PEEKSHOT_TIMEOUT_MS` (default 180000) bounds it.
- **A hosted capture has no DOM truth.** Its records carry `clean: null` (unknown) rather
  than claiming a verdict — the deterministic blank/duplicate gates and the Creative
  Director's vision pass still judge the pixels.
- **It cannot tell a good page from a broken one.** A capture of a site's "an error
  occurred" screen returns `COMPLETE` like any other; the CD's `completeness: broken`
  reject band is what catches it.

Tests: `npm run test:peekshot` (offline, stubbed `fetch`, no credits).
Live smoke: `node scripts/test-peekshot.js --live https://example.com` (1 credit).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Health check 502 on first deploy | Prebuild still installing deps | Wait 5–10 min; check `/var/log/eb-engine.log` |
| Render exits code 127 | Chromium libs missing or wrong arch | Ensure you're on the ARM platform variant; rerun `.platform/hooks/prebuild/00_system_deps.sh` manually |
| `prebuild-install` failure / native build error | EB chose non-ARM Node or wrong platform variant | Recreate env on "Node.js 22 on AL2023 arm64" |
| 429 rate limit | Hit per-IP cap | Wait 1 hr or raise `rateLimitPerHourPerIp` |
| All 3 jobs stuck at "rendering" | CPU credit exhaustion on t4g | Wait for credits to refill, or upgrade to c7g.xlarge (non-burstable) |
| Jobs stuck "queued" | Queue paused mid-shutdown | Crash recovery on next boot marks them failed |
