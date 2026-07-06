# Deploy: frontend → Vercel, backend → Render

A split deploy. The React app is served by **Vercel** (fast, free CDN); the
Express render backend runs on **Render**. They talk cross-origin via
`VITE_API_URL` (frontend → backend) + `WEB_ORIGIN` CORS (backend → frontend).

> **Prefer one host instead?** The app can also run all-in-one on a single box
> (Express serves the UI + API together — no CORS, no split). See
> [`DEPLOY.md`](./DEPLOY.md) for the free Oracle VM version.

---

## ⚠️ Read this first — Render plan & cost

Rendering launches Chromium (~1.5–2 GB RAM per render). That sets a hard floor:

| Render plan | RAM | Result |
|---|---|---|
| **Free** | 512 MB | UI + API load, but **video renders OOM-crash**. Good only to demo the interface. |
| **Standard ($25/mo)** | 2 GB | **Actually renders videos.** This is the real minimum. |

Vercel (frontend) is **free**. So: *free* gets you a clickable UI; *actually
generating videos* needs Render Standard. Pick with eyes open.

---

## Part A — Backend on Render

1. Push this repo to GitHub (already done).
2. Render Dashboard → **New → Blueprint** → select this repo. It reads
   [`render.yaml`](./render.yaml) and creates the `keyframe-backend` Docker service
   (Chromium + FFmpeg are baked into `server/Dockerfile`).
3. When prompted, set the **secret env vars** (they're `sync: false`, never in git):
   `OPENROUTER_API_KEY`, `KIE_API_KEY`, `PIXABAY_API_KEY`, `FREESOUND_TOKEN`.
   Leave `WEB_ORIGIN` blank for now (you'll set it in Part C).
4. *(To actually render)* change the service **Plan** to **Standard** (2 GB).
5. Deploy. When it's live, copy the URL — e.g. `https://keyframe-backend.onrender.com`.
6. Verify: open `https://<your-backend>.onrender.com/health` → `{"ok":true,...}`.

## Part B — Frontend on Vercel

1. Vercel Dashboard → **Add New → Project** → import this repo.
2. **Root Directory → `web`** (important — the frontend lives in `web/`, not the repo root).
   Vercel auto-detects Vite and uses `web/vercel.json`.
3. Add an **Environment Variable**:
   - `VITE_API_URL` = your Render backend URL from Part A (e.g. `https://keyframe-backend.onrender.com`)
   - *(this is build-time — it's baked into the bundle, so set it before deploying)*
4. Deploy. You'll get a URL like `https://keyframe.vercel.app`.

## Part C — Connect them (CORS)

1. Back in **Render** → your service → **Environment** → set
   `WEB_ORIGIN` = your Vercel URL (e.g. `https://keyframe.vercel.app`) → save → redeploy.
   *(This locks the API to your frontend. Leaving it blank allows any origin.)*
2. Open your Vercel URL, create a short test video, and watch it work.

> Changed `VITE_API_URL` later? Vercel must **rebuild** for it to take effect
> (it's compiled into the JS, not read at runtime).

---

## How it works (so the wiring makes sense)

- `web/src/api.js` → `API_BASE = import.meta.env.VITE_API_URL`. All `/api` calls
  and media URLs (`videoUrl`, `/frames`, `/showcase.mp4`) are prefixed with it.
  **Unset → same-origin**, so the all-in-one deploy is unaffected.
- `server/server.js` → CORS middleware allows `WEB_ORIGIN` (comma-separated
  allowlist; empty = allow all).
- `config.json` is gitignored (holds inline keys); fresh deploys fall back to
  `config.example.json` and read keys from env (`src/config.js`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Video generation crashes / service restarts mid-render | Render is OOM. Upgrade to **Standard (2 GB)**; keep `JOB_CONCURRENCY=1`, `RENDER_WORKERS=1`. |
| Browser console: **CORS blocked** | `WEB_ORIGIN` on Render must exactly equal your Vercel origin (scheme + host, no trailing slash). Redeploy after changing. |
| Frontend calls hit `localhost` / 404 | `VITE_API_URL` wasn't set at build time. Set it in Vercel → **Redeploy**. |
| First render is very slow | Normal — it bootstraps the hyperframes CLI + Chromium on first use. |
| Render free service "sleeps" | Free services spin down after 15 min idle (~50 s cold start). Standard stays warm. |
| Videos disappear after redeploy | Render's disk is ephemeral. Add a **Render Disk** (paid) mounted at the data paths for persistence. |
