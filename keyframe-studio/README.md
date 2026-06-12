# KEYFRAME Studio

Turn any website into a cinematic, fully animated HTML page.

**Pipeline:** paste a URL → the studio analyzes the site → writes a detailed video
script (scene-by-scene narration, voice direction, music/SFX cues, stock-asset
queries, concrete motion-graphics direction) → casts stock assets from Pixabay →
composes ONE self-contained, scroll-driven animated HTML page where each script
scene is a full-viewport animated section (GSAP + ScrollTrigger).

The final step — rendering that page into an actual video with HyperFrames — is
intentionally **not** built yet. This app stops at the animated page, as scoped.

## Run

```bash
cd keyframe-studio
npm install
npm start          # http://localhost:8090
```

## Configuration (`config.json`)

| Key | What |
| --- | --- |
| `llm.primary` | KIE Gemini endpoint (tried first) |
| `llm.*` | OpenRouter MiniMax M3 (fallback chain: KIE → M3 → M2.7) |
| `assets.pixabayApiKey` | Pixabay API key (free at pixabay.com/api/docs). **Empty = no stock assets**; the composer then builds every scene with pure CSS/SVG/canvas motion graphics instead — the page still looks great. |
| `server.port` | default `8090` |

Env overrides: `OPENROUTER_API_KEY`, `KIE_API_KEY`, `PIXABAY_API_KEY`, `PORT`.

## API

| Route | What |
| --- | --- |
| `POST /api/generate` `{ url, requirements? }` | start a job, returns `{ id }` |
| `GET /api/jobs/:id` | job status: `stage`, `log[]`, `script`, `pageUrl`, `error` |
| `GET /api/jobs/:id/script` | download the script JSON |
| `GET /output/:id.html` | the generated animated page |

## Architecture

```
server.js                 express, routes, static
src/config.js             config.json + env overrides
src/llm.js                fetch-based chat client, provider failover, JSON/HTML extractors
src/jobs.js               job registry + pipeline runner (analyze→script→assets→compose)
src/services/
  siteAnalyzer.js         URL fetch + brief extraction (title, headings, copy, brand colors)
  scriptwriter.js         LLM pass 1 → strict-JSON video script
  assets.js               Pixabay resolution of the script's asset queries
  composer.js             LLM pass 2 → single-file animated page
                          + deterministic fallback template (never dead-ends)
public/                   the studio frontend (film editing-bay UI)
public/output/            generated pages
jobs/                     persisted job records
```

## Notes

- If every LLM provider fails during composing, the **house template engine**
  still cuts a page from the script (GSAP kinetic type, parallax, Ken Burns,
  preloader, scroll-progress HUD). The premiere screen tells you which engine
  directed the cut.
- Generated pages respect `prefers-reduced-motion`.
- The site analyzer refuses local/private addresses (SSRF guard).
