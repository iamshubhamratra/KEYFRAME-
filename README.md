# KEYFRAME — Multi-Modal AI Video Studio

Prompt, reference video, or website URL → editable production script → art-directed,
voiced, captioned MP4 rendered via HyperFrames.

See [PLAN.md](PLAN.md) for the full build plan.

## Monorepo layout

| Dir | What |
|---|---|
| `server/` | The KEYFRAME backend (Node 22 + Express). Evolved fork of v1. |
| `web/` | Vite + React frontend (Phase 6). |
| `frames/` | Frame packs — curated design systems (`FRAME.md` + showcase) injected into the composer. |
| `heygen-keyframes-video/` | Reference: v1 prompt→video pipeline (pristine, except Windows spawn fixes). |
| `blockframe-frame-pack/`, `biennale-yellow-frame-pack/` | Reference: original frame pack sources. |
| `pixabay-no-node-modules/` | Reference: Pixabay scraper service (Cloudflare-aware). |
| `keyframe-studio/` | Separate lightweight prototype (URL → animated HTML page, port 8090). Not part of the pipeline. |

## Run the server

```powershell
cd server
npm ci
node server.js   # http://localhost:8080 — needs ffmpeg on PATH, LLM key in config.json
```

Smoke test:

```powershell
curl -X POST http://localhost:8080/api/generate -H "Content-Type: application/json" `
  -d '{"prompt":"Explain photosynthesis in a punchy way","duration":10,"quality":"480p","framePack":"blockframe"}'
curl http://localhost:8080/api/jobs/<jobId>
curl http://localhost:8080/api/frames
```

## Windows dev notes

- Node ≥18.20 needs `shell: true` to spawn `.cmd` (npx) — already handled in `validator.js`/`renderer.js`.
- FFmpeg: `winget install Gyan.FFmpeg`, then restart the shell (PATH).
- `config.json` holds API keys and is gitignored.
