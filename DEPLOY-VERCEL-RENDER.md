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
   `SECRET_KEY` (the session-cookie signing key) is **not** one of them — Render
   generates it (`generateValue: true`) and keeps it across deploys.
4. *(To actually render)* change the service **Plan** to **Standard** (2 GB).
5. Deploy. When it's live, copy the URL — e.g. `https://keyframe-backend.onrender.com`.
6. Verify **two** things, not one:
   - `https://<your-backend>.onrender.com/health` → `{"ok":true,...}`
   - `https://<your-backend>.onrender.com/api/frames` → **135 packs**, not `[]`.
     An empty list means the image shipped without `frames/` — see the build-context
     note below.

> **The Docker build context is the repo root, not `server/`.** The frame packs live
> in `frames/` *beside* `server/`, so a `./server` context leaves them outside the
> build and the image ships with none: `/api/frames` returns `[]` and every video
> renders unstyled, while local dev works perfectly. `render.yaml` therefore sets
> `dockerContext: .` with `dockerfilePath: ./server/Dockerfile`, and the repo-root
> [`.dockerignore`](./.dockerignore) filters the context down to ~48 MB (`server/`,
> `frames/`, `.agents/`) out of the repo's 2.7 GB. `frames_draft/` — unpublished admin
> templates — is deliberately **not** in the image.

## Part B — Frontend on Vercel

1. Vercel Dashboard → **Add New → Project** → import this repo.
2. **Root Directory → `web`** (important — the frontend lives in `web/`, not the repo root).
   Vercel auto-detects Vite and uses `web/vercel.json`.
3. Add an **Environment Variable**:
   - `VITE_API_URL` = your Render backend URL from Part A (e.g. `https://keyframe-backend.onrender.com`)
   - *(this is build-time — it's baked into the bundle, so set it before deploying)*
4. Deploy. You'll get a URL like `https://keyframe.vercel.app`.

## Part C — Connect them (CORS)

1. Edit `WEB_ORIGIN` in [`render.yaml`](./render.yaml) to your Vercel URL
   (e.g. `https://keyframe.vercel.app`), commit, push → Render re-syncs the blueprint
   and redeploys. **Edit the file, not the dashboard**: `WEB_ORIGIN` is declared with a
   literal `value:`, so it is blueprint-managed and a dashboard edit is reverted by the
   next sync. Scheme + host, **no trailing slash**; comma-separate to allow more than
   one origin (e.g. a Vercel preview domain).
2. Open your Vercel URL, create a short test video, and watch it work.

> **An unset `WEB_ORIGIN` is not a wildcard in production.** It used to be: the API
> echoed any request `Origin` back with `Access-Control-Allow-Credentials: true`, which
> with an httpOnly session cookie and an authenticated admin API is a CSRF surface.
> Now an empty allowlist in production means *same-origin only* — right for the
> all-in-one deploy, and a loud CORS error (never a silent hole) for a split deploy
> that forgot to configure it. Development keeps the permissive behaviour so the Vite
> dev server on another port still works.

> Changed `VITE_API_URL` later? Vercel must **rebuild** for it to take effect
> (it's compiled into the JS, not read at runtime).

---

## How it works (so the wiring makes sense)

- `web/src/api.js` → `API_BASE = import.meta.env.VITE_API_URL`. All `/api` calls
  and media URLs (`videoUrl`, `/frames`, `/showcase.mp4`) are prefixed with it.
  **Unset → same-origin**, so the all-in-one deploy is unaffected.
- `server/server.js` → CORS middleware allows `WEB_ORIGIN` (comma-separated
  allowlist). Empty allowlist: permissive in development, **same-origin only** in
  production.
- `server/src/auth/helpers.js` → signs the httpOnly `kf_auth` cookie with
  `SECRET_KEY` (or `JWT_SECRET`). The hardcoded dev fallback is disabled when
  `NODE_ENV=production`, so without one of those set the service boots but **no login
  can succeed** — hence `generateValue: true` in `render.yaml`.
- `config.json` is gitignored (holds inline keys); fresh deploys fall back to
  `config.example.json` and read keys from env (`src/config.js`).
- The image contains `server/` + `frames/` (135 packs) + `.agents/` (composer skill
  docs) and nothing else — see [`.dockerignore`](./.dockerignore), which is a
  deny-everything list with a three-entry allowlist so new repo directories never ship
  by accident.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Video generation crashes / service restarts mid-render | Render is OOM. Upgrade to **Standard (2 GB)**; keep `JOB_CONCURRENCY=1`, `RENDER_WORKERS=1`. |
| **Template gallery is empty** / logs say `[frames] no frames directory found` / videos render unstyled | The image has no frame packs. `render.yaml` must have `dockerContext: .` (repo root), *not* `./server` — with a `./server` context `frames/` is outside the build and unreachable. Check the deploy log copies `frames`, then `curl /api/frames`. |
| Browser console: **CORS blocked** | `WEB_ORIGIN` must exactly equal your Vercel origin (scheme + host, no trailing slash). It is blueprint-managed — change it in `render.yaml` and push; a dashboard edit is reverted on the next sync. |
| Login always fails; logs say `auth tokens cannot be issued` | `SECRET_KEY` is missing. It should come from `generateValue: true` in `render.yaml`; check the service's Environment tab actually has it. |
| Frontend calls hit `localhost` / 404 | `VITE_API_URL` wasn't set at build time. Set it in Vercel → **Redeploy**. |
| First render is very slow | Normal — it bootstraps the hyperframes CLI + Chromium on first use. |
| Render free service "sleeps" | Free services spin down after 15 min idle (~50 s cold start). Standard stays warm. |
| Videos disappear after redeploy | Render's disk is ephemeral. Add a **Render Disk** (paid) mounted at the data paths for persistence. |
