which # KEYFRAME — Multi-Modal AI Video Studio

Prompt, reference video, or website URL → editable production script → art-directed,
voiced, captioned MP4 rendered via HyperFrames.

See [PLAN.md](PLAN.md) for the full build plan. All 8 phases implemented:
multi-modal ingest (local whisper STT + headless-Chrome website understanding),
script checkpoint with pause/approve, a library of 126 frame-pack design systems
(16 landscape, the rest portrait/square — `edition` is the default), DB-first asset layer with
4 providers, per-scene VO with ad-lib defense, baked captions + .srt, and the
six-screen web app.

## Monorepo layout

| Dir | What |
|---|---|
| `server/` | The KEYFRAME backend (Node 22 + Express). Evolved fork of v1. |
| `web/` | Vite + React frontend (Phase 6). |
| `frames/` | Frame packs — curated design systems (`FRAME.md` + showcase) injected into the composer. |
| `heygen-keyframes-video/` | Reference: v1 prompt→video pipeline (pristine, except Windows spawn fixes). |
| `pixabay-no-node-modules/` | Reference: Pixabay scraper service (Cloudflare-aware). |
| `keyframe-studio/` | Separate lightweight prototype (URL → animated HTML page, port 8090). Not part of the pipeline. |

## Run it

```powershell
cd web && npm ci && npm run build   # builds the app into server/public/dist
cd ..\server && npm ci
node server.js                       # http://localhost:8080 — needs ffmpeg on PATH, OpenRouter key in config.json
```

Open http://localhost:8080 — paste a URL or prompt, edit the script, get a film.

API smoke test:

```powershell
curl -X POST http://localhost:8080/api/projects -H "Content-Type: application/json" `
  -d '{"prompt":"A 20s teaser for my app","duration":20,"framePack":"auto","autopilot":true}'
curl http://localhost:8080/api/projects/<id>          # state incl. brief/script/assets/captions
curl http://localhost:8080/api/projects/<id>/events   # SSE progress stream
curl http://localhost:8080/api/frames                 # design systems
```

Optional keys in `server/config.json`: `assetProviders.pixabay.apiKey` /
`assetProviders.pexels.apiKey` unlock stock *video* assets (without them,
video needs auto-downgrade to stills from keyless providers).

## Windows dev notes

- Node ≥18.20 needs `shell: true` to spawn `.cmd` (npx) — already handled in `validator.js`/`renderer.js`.
- FFmpeg: `winget install Gyan.FFmpeg`, then restart the shell (PATH).
- `config.json` holds API keys and is gitignored.
