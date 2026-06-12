#!/usr/bin/env bash
# Pre-fetches the hyperframes CLI + its Puppeteer/Chromium into the webapp
# user's npm cache so the first user-triggered render doesn't pay the
# download. Running as webapp (uid 900) avoids root-owned cache files
# blocking the subsequent `npm install` step.
#
# Best-effort: any failure here must not block deploy — first render will
# simply bootstrap it lazily.

set -uo pipefail

log() { echo "[prebuild:warm_hyperframes] $*"; }

if ! id -u webapp >/dev/null 2>&1; then
  log "warning: webapp user not found; skipping warm"
  exit 0
fi

WEBAPP_HOME="$(getent passwd webapp | cut -d: -f6)"
WEBAPP_HOME="${WEBAPP_HOME:-/home/webapp}"
mkdir -p "$WEBAPP_HOME/.npm"
chown -R webapp:webapp "$WEBAPP_HOME/.npm" 2>/dev/null || true

log "warming npx hyperframes as webapp (first deploy can take a few minutes)"
if sudo -u webapp -H -- bash -lc 'npx --yes hyperframes --version >/dev/null 2>&1'; then
  VER="$(sudo -u webapp -H -- bash -lc 'npx --yes hyperframes --version 2>/dev/null' || echo unknown)"
  log "hyperframes CLI cached for webapp: ${VER}"
else
  log "warning: warm step failed (non-fatal) — first render will bootstrap it"
fi

exit 0
