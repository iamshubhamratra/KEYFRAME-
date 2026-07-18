// Runs `npx hyperframes render` inside a job directory and moves the
// resulting MP4 into public/videos/<jobId>.mp4. Watchdog kills long-running
// renders. Output path follows the reference repo's convention: ./renders/out.mp4.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { spawnCompat, killTree } = require("./spawn_compat");
const config = require("../config");

const WINDOWS = process.platform === "win32";

// Run an ffmpeg invocation and resolve with its stdout buffer (null on error).
function ffCapture(args) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args);
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("error", () => resolve(null));
    p.on("exit", () => resolve(Buffer.concat(chunks)));
  });
}

// Pick a NON-BLACK gallery poster. Videos that open on a dark scene (e.g. a
// "chaos" intro) yield a black thumbnail when a single early frame is grabbed,
// making the gallery card look blank. Sample several frames across the clip and
// keep the brightest one.
async function generateThumbnail(videoPath, thumbPath, durationSec) {
  const dur = Number(durationSec) > 0 ? Number(durationSec) : 10;
  const fracs = [0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88];
  let bestT = (dur * 0.5).toFixed(2);
  let bestLum = -1;
  for (const fr of fracs) {
    const t = Math.max(0.1, dur * fr).toFixed(2);
    const buf = await ffCapture(["-v", "error", "-ss", String(t), "-i", videoPath, "-frames:v", "1", "-vf", "scale=1:1,format=gray", "-f", "rawvideo", "-"]);
    const lum = buf && buf.length ? buf[0] : 0; // single 1x1 gray pixel = avg luminance
    if (lum > bestLum) { bestLum = lum; bestT = t; }
  }
  await ffCapture(["-y", "-hide_banner", "-loglevel", "error", "-ss", String(bestT), "-i", videoPath, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", thumbPath]);
}

// Render failures that are NOT the composition's fault and clear on a fresh
// launch a few seconds later — safe to retry:
//   • Windows NTSTATUS exceptions (exit code in the 0xC0000000+ range), e.g.
//     0xC0000142 (STATUS_DLL_INIT_FAILED) when node/Chromium can't init under
//     memory (commit) or desktop-heap pressure. Signature: an EMPTY tail —
//     the process died before printing a byte. Retries drop to 1 render
//     worker, halving the Chromium commit footprint.
//   • A plain non-zero exit (1) AFTER the browser had already launched — a
//     transient Chromium render hiccup (asset decode timing, GPU/ANGLE blip,
//     memory pressure on the 8GB box). Lint + runtime smoke already passed, and
//     the identical composition often renders cleanly on a second pass.
// Watchdog/abort kills (signal set, code null) are NOT retried — we killed it.
const NT_CRASH_FLOOR = 0xC0000000; // 3221225472
const isNtCrash = (code) => typeof code === "number" && code >= NT_CRASH_FLOOR;
function isTransientLaunchCrash(code, signal) {
  if (signal) return false;                 // we killed it (watchdog/abort)
  if (typeof code !== "number") return false;
  if (isNtCrash(code)) return true;         // Windows fatal-exception range
  return code !== 0;                         // any other non-zero exit — retry
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// One render attempt. Resolves { ok, code, signal, stdout, stderr } — never
// rejects on a non-zero exit, so the retry loop can decide what to do.
function renderAttempt({ jobId, jobDir, outRelative, durationSec, quality, abortSignal, workers }) {
  return new Promise((resolve) => {
    const cmd = WINDOWS ? "npx.cmd" : "npx";
    // Pin the hyperframes version so renders are deterministic and immune to
    // npm publish-propagation races (an unpinned `latest` can resolve to a
    // version whose tarball hasn't propagated yet → ETARGET). Bump the pin in
    // config.render.hyperframesVersion. Falls back to unpinned `latest`.
    const hfVersion = config.render?.hyperframesVersion;
    const hfSpec = hfVersion ? `hyperframes@${hfVersion}` : "hyperframes";
    const args = [
      "--yes", hfSpec, "render",
      "--output", outRelative,
      "--quality", quality,
      "--workers", String(workers),
    ];

    // spawnCompat runs .cmd shims under a shell (CVE-2024-27980) with pre-quoted
    // args (avoids DEP0190). windowsHide keeps the cmd/conhost chain off the
    // desktop heap — the same heap whose exhaustion produces 0xC0000142 crashes.
    const child = spawnCompat(cmd, args, {
      cwd: jobDir,
      env: { ...process.env, PUPPETEER_DISABLE_HEADLESS_WARNING: "true" },
      windowsHide: true,
    });

    let stdout = "", stderr = "";
    let lastLoggedPct = 0;
    const spawnedAt = Date.now();
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      // Surface progress ticks at 10% increments so long renders don't go silent.
      const pctMatch = s.match(/(\d{1,3})\s*%\s+Capturing frame/);
      if (pctMatch) {
        const pct = Math.min(100, parseInt(pctMatch[1], 10));
        if (pct >= lastLoggedPct + 10) {
          const elapsed = Math.round((Date.now() - spawnedAt) / 1000);
          console.log(`[renderer] job ${jobId} ${pct}% (${elapsed}s elapsed)`);
          lastLoggedPct = Math.floor(pct / 10) * 10;
        }
      }
    });

    // Watchdog accommodates first-render overhead (Hyperframes downloads ~107 MB
    // Chromium on the first use of a fresh deploy). Formula:
    //   max(minSec, duration × multiplier) + bufferSec
    // A degraded retry (fewer workers than configured) captures frames slower,
    // so the window stretches proportionally.
    const minSec    = Math.max(0, Number(config.server.watchdogMinSec)    || 0);
    const bufferSec = Math.max(0, Number(config.server.watchdogBufferSec) || 60);
    const mult      = Math.max(1, Number(config.server.watchdogMultiplier) || 8);
    const configuredWorkers = Math.max(1, Number(config.server.renderWorkers) || 1);
    const slowFactor = Math.max(1, configuredWorkers / workers);
    const coreSec   = Math.ceil(Math.max(minSec, Math.floor(durationSec * mult)) * slowFactor);
    const watchdogMs = coreSec * 1000 + bufferSec * 1000;

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (abortSignal) abortSignal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.warn(`[renderer] job ${jobId} exceeded ${watchdogMs}ms; killing`);
      killTree(child);
    }, watchdogMs);

    // If an AbortController signal is passed (from pipeline budget timeout),
    // kill the child process immediately — prevents zombie renders from
    // eating CPU after the pipeline has moved on to the next tier.
    const onAbort = () => {
      console.warn(`[renderer] job ${jobId} aborted by pipeline; killing`);
      killTree(child);
    };
    if (abortSignal) {
      if (abortSignal.aborted) onAbort();
      else abortSignal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (e) => finish({ ok: false, code: -1, signal: null, stdout, stderr: `${stderr}\nspawn error: ${e.message}` }));
    child.on("exit", (code, signal) => finish({ ok: code === 0, code, signal, stdout, stderr }));
  });
}

async function render({ jobId, jobDir, durationSec, quality = config.server.renderQuality, abortSignal }) {
  const outRelative = path.join("renders", "out.mp4");
  fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });

  // Up to 3 attempts with growing backoff. A transient failure (Chromium/node
  // launch crash like 0xC0000142 under commit/desktop-heap pressure, or a plain
  // exit-1 hiccup after launch) often clears once memory settles — the
  // composition itself already passed lint + runtime smoke. After an NTSTATUS
  // crash the retry drops to 1 render worker: half the Chromium footprint is
  // the difference between "can't start a process" and a slower-but-finished
  // film on a loaded machine.
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = [0, 5000, 20000];
  const configuredWorkers = Math.max(1, Number(config.server.renderWorkers) || 1);
  let workers = configuredWorkers;
  let res;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    if (abortSignal?.aborted) throw abortSignal.reason || new Error("render aborted");
    res = await renderAttempt({ jobId, jobDir, outRelative, durationSec, quality, abortSignal, workers });
    if (res.ok) break;
    if (i < MAX_ATTEMPTS && isTransientLaunchCrash(res.code, res.signal) && !abortSignal?.aborted) {
      const hex = `0x${(res.code >>> 0).toString(16)}`;
      if (isNtCrash(res.code) && workers > 1) workers = 1; // halve Chromium memory for the retry
      console.warn(
        `[renderer] job ${jobId} attempt ${i} failed (code ${res.code} = ${hex})` +
        `${isNtCrash(res.code) ? " — process died at init (out of memory/desktop heap)" : ""}; ` +
        `retrying in ${RETRY_DELAY_MS[i] / 1000}s with --workers ${workers}`
      );
      await delay(RETRY_DELAY_MS[i]);
      continue;
    }
    break;
  }

  if (!res.ok) {
    const tail = [res.stdout.slice(-1500), res.stderr.slice(-1500)].filter(Boolean).join("\n---\n");
    // An NTSTATUS exit with an empty tail = the render process never got far
    // enough to print anything: Windows refused to start it (commit charge or
    // desktop heap exhausted). Say so — "code 3221225794" alone helps nobody.
    let hint = "";
    if (isNtCrash(res.code) && !tail) {
      const freeGb = (require("node:os").freemem() / 1024 ** 3).toFixed(1);
      hint = `\nThe render process crashed at startup (0x${(res.code >>> 0).toString(16)} — Windows could not ` +
        `initialize it; the machine is out of memory or desktop heap; ${freeGb} GB RAM free right now). ` +
        `Close some applications (browsers are the usual culprit) or grow the pagefile, then retry the render.`;
    }
    throw new Error(
      `render exited with code ${res.code}${res.signal ? ` (signal ${res.signal})` : ""} after ${MAX_ATTEMPTS} attempts.${hint}${tail ? ` Tail:\n${tail}` : ""}`
    );
  }

  const srcPath = path.join(jobDir, outRelative);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`render reported success but ${outRelative} is missing`);
  }

  fs.mkdirSync(config.paths.videosDir, { recursive: true });
  const destPath = path.join(config.paths.videosDir, `${jobId}.mp4`);
  try {
    fs.renameSync(srcPath, destPath);
  } catch (e) {
    // Cross-device fallback (rare on EB, but safe): copy + unlink.
    fs.copyFileSync(srcPath, destPath);
    fs.unlinkSync(srcPath);
  }

  // Gallery thumbnail (best effort, non-blocking): brightest sampled frame so a
  // dark intro never produces a blank-looking card.
  try {
    const thumbPath = path.join(config.paths.videosDir, `${jobId}.jpg`);
    generateThumbnail(destPath, thumbPath, durationSec).catch(() => { /* thumbnail is optional */ });
  } catch { /* noop */ }

  return { videoPath: destPath, videoUrl: `/videos/${jobId}.mp4` };
}

module.exports = { render };
