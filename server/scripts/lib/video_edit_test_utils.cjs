// Shared helpers for scripts/video_edit_*.test.cjs.
//
// WHY THIS EXISTS. Every AI Video Edit test must be offline, isolated in a temp dir, and never load
// the real config (config.js pulls server/.env into the process). These helpers give each test file
// the same tiny async t() harness as scripts/pacing.test.cjs, a throwaway settings object resolved
// against a temp root, lavfi media fixtures, and a fetch tripwire.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

process.env.VIDEO_EDIT_SKIP_CONFIG = "1";

function createHarness() {
  const tests = [];
  let passed = 0;
  let failed = 0;
  function t(name, fn) { tests.push({ name, fn }); }
  function section(title) { tests.push({ section: title }); }
  async function run() {
    for (const item of tests) {
      if (item.section) { console.log(`\n${item.section}`); continue; }
      const started = Date.now();
      try {
        await item.fn();
        passed++;
        console.log(`  ok  ${item.name} (${Date.now() - started}ms)`);
      } catch (e) {
        failed++;
        process.exitCode = 1;
        console.error(`  FAIL ${item.name}\n       ${e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n       ") : e}`);
      }
    }
    console.log(`\n${passed} passed, ${failed} failed${failed ? " — WITH FAILURES" : ""}\n`);
    return { passed, failed };
  }
  return { t, section, run };
}

function mkTmp(prefix = "ve-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup() { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* noop */ } },
  };
}

// Settings resolved against a temp root with no real config.
function makeSettings(root, { env = {}, videoEdit = undefined, cpus = 2 } = {}) {
  const { resolveSettings } = require("../../src/video_edit/settings");
  const config = { paths: { root, jobsDir: path.join(root, "jobs"), uploadsDir: path.join(root, "uploads"), videosDir: path.join(root, "public", "videos") } };
  if (videoEdit !== undefined) config.videoEdit = videoEdit;
  return resolveSettings({ config, env: { NODE_ENV: "test", ...env }, cpus });
}

// ffmpeg lavfi fixture: testsrc2 + sine, h264/aac mp4.
function makeFixture(file, { seconds = 2, size = "320x240", fps = 30 } = {}) {
  const r = spawnSync("ffmpeg", [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${fps}:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file,
  ], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`fixture ffmpeg failed: ${String(r.stderr).slice(-300)}`);
  return file;
}

// Blocks global fetch AND non-loopback node:http/https requests. The second half matters: the
// `openai` SDK behind services/openrouter.chat ships its own HTTP client (node-fetch over
// http.request), so a fetch-only tripwire let real, billed model calls through. Loopback stays
// open for in-process mock provider servers.
const LOOPBACK_HOST = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\])$/i;

function requestHost(args) {
  const [a, b] = args;
  try {
    if (typeof a === "string" || a instanceof URL) {
      const u = new URL(String(a));
      return (b && typeof b === "object" && (b.hostname || b.host)) || u.hostname;
    }
    const o = a && typeof a === "object" ? a : {};
    return String(o.hostname || o.host || "localhost").replace(/:\d+$/, "");
  } catch {
    return "";
  }
}

function installFetchTripwire() {
  const http = require("node:http");
  const https = require("node:https");
  const original = globalThis.fetch;
  const saved = { httpRequest: http.request, httpGet: http.get, httpsRequest: https.request, httpsGet: https.get };
  const guard = (orig, label) => function guardedRequest(...args) {
    const host = requestHost(args);
    if (!LOOPBACK_HOST.test(host)) throw new Error(`network access is forbidden in video_edit tests (${label} ${host || "?"})`);
    return orig.apply(this, args);
  };
  globalThis.fetch = () => { throw new Error("network access is forbidden in video_edit tests"); };
  http.request = guard(saved.httpRequest, "http");
  http.get = guard(saved.httpGet, "http");
  https.request = guard(saved.httpsRequest, "https");
  https.get = guard(saved.httpsGet, "https");
  return () => {
    globalThis.fetch = original;
    http.request = saved.httpRequest;
    http.get = saved.httpGet;
    https.request = saved.httpsRequest;
    https.get = saved.httpsGet;
  };
}

const silentLog = { info() {}, warn() {}, error() {}, log() {} };

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

module.exports = { createHarness, mkTmp, makeSettings, makeFixture, installFetchTripwire, silentLog, isAlive };
