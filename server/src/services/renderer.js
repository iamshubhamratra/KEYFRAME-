// Runs `npx hyperframes render` inside a job directory and moves the
// resulting MP4 into public/videos/<jobId>.mp4. Watchdog kills long-running
// renders. Output path follows the reference repo's convention: ./renders/out.mp4.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const config = require("../config");

const WINDOWS = process.platform === "win32";

function render({ jobId, jobDir, durationSec, quality = config.server.renderQuality, abortSignal }) {
  return new Promise((resolve, reject) => {
    const cmd = WINDOWS ? "npx.cmd" : "npx";
    const outRelative = path.join("renders", "out.mp4");
    const workers = Math.max(1, Number(config.server.renderWorkers) || 1);
    const args = [
      "--yes", "hyperframes", "render",
      "--output", outRelative,
      "--quality", quality,
      "--workers", String(workers),
    ];

    fs.mkdirSync(path.join(jobDir, "renders"), { recursive: true });

    // Node ≥18.20 throws EINVAL spawning .cmd files without a shell (CVE-2024-27980).
    const child = spawn(cmd, args, {
      cwd: jobDir,
      env: { ...process.env, PUPPETEER_DISABLE_HEADLESS_WARNING: "true" },
      shell: WINDOWS,
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
    // Defaults: 10 s video → max(360, 100) + 180 = 540 s;
    //           30 s video → max(360, 300) + 180 = 540 s;
    //          150 s video → max(360, 1500) + 180 = 1680 s (28 min).
    const minSec    = Math.max(0, Number(config.server.watchdogMinSec)    || 0);
    const bufferSec = Math.max(0, Number(config.server.watchdogBufferSec) || 60);
    const mult      = Math.max(1, Number(config.server.watchdogMultiplier) || 8);
    const coreSec   = Math.max(minSec, Math.floor(durationSec * mult));
    const watchdogMs = coreSec * 1000 + bufferSec * 1000;

    const timer = setTimeout(() => {
      console.warn(`[renderer] job ${jobId} exceeded ${watchdogMs}ms; killing`);
      try { child.kill("SIGKILL"); } catch { /* noop */ }
    }, watchdogMs);

    // If an AbortController signal is passed (from pipeline budget timeout),
    // kill the child process immediately — prevents zombie renders from
    // eating CPU after the pipeline has moved on to the next tier.
    const onAbort = () => {
      console.warn(`[renderer] job ${jobId} aborted by pipeline; killing`);
      clearTimeout(timer);
      try { child.kill("SIGKILL"); } catch { /* noop */ }
    };
    if (abortSignal) {
      if (abortSignal.aborted) onAbort();
      else abortSignal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`render spawn error: ${e.message}`));
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = [stdout.slice(-1500), stderr.slice(-1500)].filter(Boolean).join("\n---\n");
        return reject(new Error(
          `render exited with code ${code}${signal ? ` (signal ${signal})` : ""}. Tail:\n${tail}`
        ));
      }

      const srcPath = path.join(jobDir, outRelative);
      if (!fs.existsSync(srcPath)) {
        return reject(new Error(`render reported success but ${outRelative} is missing`));
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
      resolve({ videoPath: destPath, videoUrl: `/videos/${jobId}.mp4` });
    });
  });
}

module.exports = { render };
