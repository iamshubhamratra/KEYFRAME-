// Keeps the local Pixabay bridge (../pixabay-no-node-modules) running so audio
// (BGM + SFX) and vectors actually come from Pixabay. The bridge is a separate
// headless-Chrome scraper on port 3007; when it's DOWN, audio_sources silently
// falls through to the synthesized pad (music) / nothing (SFX) — which is how
// "Pixabay-only audio" degrades into no real music. Auto-starting it on boot
// removes that manual step.
//
// Fail-soft by construction: if the bridge dir/entry is missing, or the spawn
// fails, generation still works (audio just falls back). Never throws.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const BRIDGE_URL = (process.env.PIXABAY_BRIDGE_URL || "http://localhost:3007/api/v1").replace(/\/$/, "");
const BRIDGE_PORT = (() => { try { return new URL(BRIDGE_URL).port || "3007"; } catch { return "3007"; } })();
const BRIDGE_DIR = path.resolve(__dirname, "..", "..", "..", "pixabay-no-node-modules");
const DISABLED = process.env.PIXABAY_BRIDGE_DISABLED === "1" || process.env.PIXABAY_BRIDGE_AUTOSTART === "0";

let child = null;

async function isUp(timeoutMs = 3000) {
  try {
    const r = await fetch(BRIDGE_URL, { signal: AbortSignal.timeout(timeoutMs) });
    return r.status < 500;
  } catch { return false; }
}

// Start the bridge if it isn't already listening. Returns true if it's up
// (already-running or freshly started), false if unavailable.
async function ensureUp() {
  if (DISABLED) return false;
  if (await isUp()) { console.log(`[pixabay-bridge] already up on :${BRIDGE_PORT}`); return true; }

  const entry = path.join(BRIDGE_DIR, "src", "index.js");
  if (!fs.existsSync(entry)) {
    console.warn(`[pixabay-bridge] autostart skipped — not found at ${BRIDGE_DIR} (audio will fall back)`);
    return false;
  }

  try {
    const logPath = path.join(BRIDGE_DIR, "bridge.log");
    const out = fs.openSync(logPath, "a");
    child = spawn(process.execPath, [entry], {
      cwd: BRIDGE_DIR,
      // Own process group + detached so a --watch restart of THIS server does
      // not tear the scraper down mid-download; ignore stdin, log to file.
      detached: true,
      windowsHide: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, PORT: BRIDGE_PORT },
    });
    child.on("error", (e) => console.warn(`[pixabay-bridge] autostart error: ${e.message}`));
    child.unref();
    console.log(`[pixabay-bridge] autostarting on :${BRIDGE_PORT} (pid ${child.pid}, log ${logPath})`);
  } catch (e) {
    console.warn(`[pixabay-bridge] autostart failed: ${e.message} (audio will fall back)`);
    return false;
  }

  // Poll up to ~40s for Chrome/Express to come alive; non-fatal past that.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    if (await isUp()) { console.log(`[pixabay-bridge] ready on :${BRIDGE_PORT}`); return true; }
  }
  console.warn("[pixabay-bridge] did not report ready within 40s — will retry lazily on first audio call");
  return false;
}

// Fire-and-forget wrapper for boot.
function warmUp() { ensureUp().catch((e) => console.warn(`[pixabay-bridge] warmUp: ${e.message}`)); }

module.exports = { ensureUp, warmUp, isUp };
