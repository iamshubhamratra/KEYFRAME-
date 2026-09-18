# KEYFRAME backend — for Render (or any Docker host).
# Bundles Chromium + FFmpeg so the hyperframes/puppeteer render engine works.
# Build context is the REPO ROOT, not ./server (see render.yaml) — the frame-pack
# library (frames/, FRAME.md per pack) lives one level above server/, and
# frame_registry.js resolves it as a sibling directory at runtime.
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

# Install deps first (better layer caching). .env / config.json are gitignored
# and never enter the image — secrets come from Render env vars; config falls
# back to config.example.json (see src/config.js).
COPY server/package*.json ./server/
RUN cd server && (npm ci --omit=dev || npm install --omit=dev)

# Whole repo (frames/, server/, ...) — see .dockerignore at repo root for what's excluded.
COPY . .

WORKDIR /app/server

# Render injects PORT; config.js reads it. EXPOSE is informational.
EXPOSE 8080
CMD ["node", "server.js"]
