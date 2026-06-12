#!/usr/bin/env bash
# Additional webfonts commonly used by the composer (Roboto) so server-side
# Chromium renders text visually similar to user expectations. Best-effort —
# a failure here never blocks deploy.

set -uo pipefail   # intentionally NOT -e; font fetches must not fail the deploy

log() { echo "[prebuild:fonts] $*"; }

FONT_DIR="/usr/share/fonts/webfonts"
mkdir -p "$FONT_DIR"

download_font() {
  local name="$1" url="$2"
  local target="$FONT_DIR/$name"
  if [ -f "$target" ]; then return 0; fi
  log "fetching $name"
  if ! curl -fsSL "$url" -o "$target"; then
    log "warning: failed to fetch $name (non-fatal)"
    rm -f "$target"
  fi
}

# Roboto from Google's official open-source repo (stable CDN-like raw paths).
download_font "Roboto-Regular.ttf" \
  "https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf"
download_font "Roboto-Bold.ttf" \
  "https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Bold.ttf"

# Inter: skipped. Composer prompt already falls back to Roboto / system-ui.
# (Upstream Inter distribution URL was unstable; not worth blocking renders on.)

fc-cache -f "$FONT_DIR" >/dev/null 2>&1 || true
log "done"
exit 0
