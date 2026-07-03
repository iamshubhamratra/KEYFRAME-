# KEYFRAME — Multi-Modal AI Video Studio — Master Build Plan

> **One-line pitch:** Users feed in a prompt, a reference video, or a website URL. The system understands the intent, writes a detailed editable script, plans every asset and motion beat, composes a cinematic HTML page styled by a curated frame-pack design system, and renders it to MP4 via HyperFrames.


hello w=everyone 


## 0. What already exists (REUSE, don't rewrite)

| Folder | What it is | What to reuse |
|---|---|---|
| `heygen-keyframes-video/` | Working v1 of prompt→video pipeline (Node/Express, EB-ready) | ENTIRE backend skeleton: pipeline.js (4-tier degradation), renderer.js, validator.js, composer.js, storyboard.js, tts.js, audio_mix.js, audio_planner.js, audio_sources.js, pixabay_visual.js, fallback.js, janitor.js, db.js, usage.js, eta.js, all 4 prompts, EB deploy configs |
| `blockframe-frame-pack/` | Neo-brutalist candy pastels, 4px black borders, hard offset shadows, Inter 800–900 | FRAME.md + frame-showcase.html |
| `biennale-yellow-frame-pack/` | Warm parchment, indigo ink, solar yellow, Instrument Serif editorial | FRAME.md + frame-showcase.html |
| `pixabay-no-node-modules/` | Standalone Pixabay scraper | pixabaySite.js (Cloudflare challenge waiter, JSON hit extraction) + lightpandaBrowser.js |

**Critical architectural facts from v1 (do not regress):**
- HyperFrames compositions: single-file HTML, `#root.composition` with `data-width/height/duration`, every clip a direct child with `class="clip" data-start data-duration data-track-index`, exactly ONE paused GSAP timeline as `window.__timelines["vid"]`. Lint via `npx hyperframes lint`, render via `npx hyperframes render --output renders/out.mp4 --quality <q> --workers <n>`.
- `<img>`/`<video>` srcs must exactly match `availableAssets`; audio NEVER in HTML — mixed post-render with FFmpeg.
- LLM calls through `openrouter.js` primary/fallback chain. Keep abstraction.
- Budget timeouts wrap every stage (`withBudget` + AbortController).
- Concurrency: `JOB_CONCURRENCY × RENDER_WORKERS ≤ vCPU − 1`.

## 1. The 13-stage pipeline

Prompt → Improve Prompt → Detailed Script → Storyboard → Scene Planning → Asset Planning → Asset Collection → Frame Selection → HTML Composition → Animation → Voiceover → Timeline Assembly → Render

| # | Stage | Service file | Status |
|---|---|---|---|
| 1 | Ingest (prompt + video upload + URL) | `src/services/ingest/` | New |
| 2 | Improve Prompt → Creative Brief | `src/services/brief.js` | New |
| 3 | Detailed Script (user-editable) | `src/services/script.js` | New |
| 4–5 | Storyboard + Scene Planning (beats) | `storyboard.js` | Upgrade |
| 6 | Asset Planning | `asset_planner.js` | Upgrade |
| 7 | Asset Collection (DB-first, then Pixabay+) | `pixabay_visual.js` + scraper | Upgrade |
| 8 | Frame Selection | `frame_registry.js` | New |
| 9–10 | HTML Composition + Animation | `composer.js` | Upgrade |
| 11 | Voiceover | `tts.js` | Reuse |
| 12 | Timeline Assembly (mix + captions) | `audio_mix.js` + `captions.js` | Upgrade |
| 13 | Render | `renderer.js` | Reuse |

## 2. Stage specs (key points)

### Stage 1 — Multi-modal ingest
`POST /api/projects` multipart: `prompt`, `referenceVideo` (mp4/mov/webm ≤200MB), `websiteUrl`, `duration`, `orientation`, `voiceStyle`, `framePack` ("auto"). Three parallel workers:
- **1a transcribe.js:** ffmpeg extract audio → faster-whisper local (`small` model) OR hosted STT via `config stt.provider` (Deepgram/Groq). Sample 6–10 frames → vision LLM for visual style summary. Output `{transcript, segments[], visualStyleNotes}`.
- **1b website.js:** lightpandaBrowser puppeteer. Capture screenshot, title, meta, h1–h3, body text (~4000 chars), OG image, dominant colors via sharp. Output `{title, description, headings[], bodyText, brandColors[], screenshotPath}`.
- **1c prompt passthrough.** All merged into one **Intent Object**.

### Stage 2 — Creative Brief (`brief.js` + `prompts/system_brief.md`)
One LLM call, strict JSON: `improvedPrompt, audience, tone, goal, keyMessages[], mustIncludeFacts[] (never invent), brandColors[], suggestedFramePack, suggestedDuration, musicMood, voProfile`. Ground every claim in inputs; prompt > website > transcript on conflict; playful/product → blockframe, editorial/elegant → biennale-yellow.

### Stage 3 — Detailed Script — USER-EDITABLE CHECKPOINT
LLM produces `{title, scenes[{id, start, duration, purpose, voiceover (~2.6 words/sec), onScreenText[], visualDirection, assetNeeds[{type,query,role}], sfx[], musicCue}], music{mood,query}, voice{style,pace}}`.
**Pipeline PAUSES** at status `script_review`. `POST /api/projects/:id/approve` (with edited script) resumes. `?autopilot=true` skips.

### Stages 4–5 — Storyboard takes approved script; enrich scenes with `beats[]` ({at, action, easing}), `transitionOut` (wipe|scale-through|match-cut|hard-cut), `layout` (fullbleed|split-60-40|grid-2x2|centered-card). Keep lint-friendly constraints.

### Stage 6 — Asset planning: script's assetNeeds first; per-role (backgrounds→videos, insets→images, decorations→vectors); 2 fallback queries per asset.

### Stage 7 — Asset collection: **OUR DATABASE FIRST** (local asset cache) → Pixabay API → scraper port → Pexels/Openverse stubs. Provider interface `{search(query, type, orientation) → [{url,width,height,license}]}` in `asset_sources/`. Validate with ffprobe/sharp; manifest is the only source of truth for composer. Store source URL + license per asset.

### Stage 8 — Frame registry: `frames/{blockframe,biennale-yellow,midnight-glass}/` each with FRAME.md + showcase. midnight-glass is NEW (deep navy, frosted cards, neon accent, Space Grotesk). `pickPack(brief)`; selected FRAME.md injected verbatim into composer prompt. "Atoms are sacred, composition is free."

### Stages 9–10 — Composer upgrades: keep ALL lint-enforced constraints; inject FRAME.md + approved script + beats; ≥3 simultaneously animated layers per scene; staggered text; animated counters; pack decorative atoms; GSAP CDN core only; keep 2-attempt lint repair → asset-less tiers → pack-aware fallback.js.

### Stage 11 — Voiceover: tts.js with exact script lines; ffprobe each clip; if VO overruns scene >10%, ONE LLM tighten + re-synth (`vo_fit.js`).

### Stage 12 — Timeline: keep FFmpeg mix (VO offsets + ducked music + SFX). NEW captions.js: word-timed captions baked in + .srt export. Verify duration ±0.2s.

### Stage 13 — Render: unchanged + thumbnail grab (`ffmpeg -ss 1 -vframes 1`).

## 3. Backend shape
Node 22 + Express. Routes: `POST /api/projects` (multipart) → stops at script_review; `GET /api/projects/:id`; `POST /api/projects/:id/approve`; `POST /api/projects/:id/regenerate` ({from: stage}); `GET /api/frames` (pack list + boot-rendered preview thumbnails); SSE `GET /api/projects/:id/events`. Job store: db.js JSON, SQLite-swappable. Config: `stt.*`, `assetProviders.*`, `frames.defaultPack`, env-overridable. EB hooks: add faster-whisper + git-lfs.

## 4. LLM strategy
Keep openrouter.js chain. Per-stage models: brief/script/storyboard + composer → strongest model; asset planner/vo_fit/repairs → fast cheap. Strict JSON, no fences, zod validation, ONE repair re-ask. Track cost via usage.js, surface in UI.

## 5. Frontend
Vite + React + Tailwind + Framer Motion + GSAP, served from `public/dist`. Dark studio aesthetic: near-black #0A0A0C, one electric accent, Inter/Space Grotesk, film-grain 2%. Screens: 1) Landing/Create (morphing 3-tab input: Prompt/Video/URL, duration slider, orientation toggle, frame-pack carousel with live GSAP previews), 2) Understanding (extracted signals appear as cards), 3) Script Room (editable scene-card timeline, drag-reorder, pace meter, per-scene regenerate, Approve & Produce), 4) Production Theater (SSE film-strip stage tracker, asset mosaic, ETA), 5) Premiere (cinematic reveal, MP4+SRT download, remix, cost breakdown, attribution), 6) Gallery (hover-scrub). 150–250ms ease-out, spring physics, reduced-motion respected.

## 6. Build order
- **Phase 0 (½d):** monorepo `server/`+`web/`+`frames/`; v1 running locally; one successful test render. GATE.
- **Phase 1 (1d):** frame registry; same prompt in both packs → two visibly different on-system videos.
- **Phase 2 (1–2d):** brief/script + pause/approve. Edit VO via curl → video speaks edited line.
- **Phase 3 (2d):** ingest (whisper + puppeteer). URL-only → on-brand script with real site copy/colors.
- **Phase 4 (1d):** provider interface + DB-first asset cache + scraper port + fallback queries.
- **Phase 5 (2d):** composer quality (beats, richness, pack injection), VO fit, captions, pack-aware fallback.
- **Phase 6 (3–4d):** frontend screens 1→5, SSE, Gallery; live pack previews last.
- **Phase 7 (1d):** hardening, janitor for uploads, rate limits, EB deploy, smoke-test 3 input modes.

**Definition of done:** a stranger pastes a URL, watches the AI's understanding appear, edits one script line, and 3–6 minutes later downloads a designed, captioned, voiced, music-mixed MP4.

## 7. Risks
- Differentiator = multi-modal intent fusion + visible understanding UI + editable script checkpoint + curated frame packs.
- Pixabay scraping can break (Cloudflare) → provider interface + API-first ordering.
- ~3 parallel jobs max on 4-vCPU. Composer is the quality bottleneck — strongest model + golden test prompts library.
- Licensing: store source URL + license per asset; attribution in Premiere panel.
- Assets cached in our database; DB checked first, external providers are fallbacks.
