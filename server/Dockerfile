# KEYFRAME backend — for Render (or any Docker host).
# Bundles Chromium + FFmpeg so the hyperframes/puppeteer render engine works.
#
# BUILD CONTEXT IS THE REPO ROOT — `docker build -f server/Dockerfile .`, and
# render.yaml sets `dockerContext: .` to match. It used to be ./server, which put the
# 135 frame packs in <repo>/frames one level ABOVE the context and therefore out of
# reach of any COPY: the image shipped with zero packs and GET /api/frames returned an
# empty gallery in production. The repo-root .dockerignore carries the full chain and
# decides what the context actually contains (~48 MB of the repo's 2.7 GB).
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Chromium (pulls its own runtime libs), FFmpeg, and fonts for text rendering.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ffmpeg ca-certificates \
      fonts-liberation fonts-dejavu fonts-noto-core fonts-noto-color-emoji \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first, from server/package*.json ALONE, so that editing a composer or
# adding a frame pack does not invalidate the slow npm layer. .env / config.json are
# gitignored AND excluded by .dockerignore, so they never enter the image — secrets
# come from Render env vars and config falls back to config.example.json (src/config.js).
COPY server/package*.json ./server/
RUN cd server && (npm ci --omit=dev || npm install --omit=dev)

# Everything the runtime reads: server/, frames/, .agents/. What "." expands to is
# decided entirely by the repo-root .dockerignore (deny-all + a three-entry allowlist)
# rather than by a list of COPY lines here. Two allowlists drift apart silently, and a
# `COPY frames ./frames` hard-fails the build on any checkout that lacks the directory
# instead of degrading — which is how a deploy tool ends up with no image at all.
COPY . ./

# THE IN-IMAGE LAYOUT IS THE REPO LAYOUT, DELIBERATELY. /app/server is byte-for-byte
# what the old image had at /app, so config.paths.root (src/config.js resolves it as
# <src>/.., i.e. the server dir), the process cwd, and every path derived from either
# are unchanged by this fix. The single difference is that <root>/../frames — the
# first candidate resolveFramesDir() has always probed — now exists, at /app/frames.
# Flattening server/ into /app instead would have forced frames to /frames, a path
# nothing in the repo uses and nothing in dev would ever exercise.
WORKDIR /app/server

# Render injects PORT; config.js reads it. EXPOSE is informational.
EXPOSE 8080
CMD ["node", "server.js"]
