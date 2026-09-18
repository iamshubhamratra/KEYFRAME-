#!/usr/bin/env node
// Runs every AI Video Edit test suite (scripts/video_edit_*.test.cjs + generation_mode) one at a
// time and prints a pass/fail matrix.
//
// WHY ONE AT A TIME. Several suites drive real ffmpeg / HyperFrames renders; on a 2-core host running
// them in parallel turns timing assertions (cancel latency, watchdogs) into flakes.
//
// Usage (from server/):
//   node scripts/run-video-edit-tests.js                 all suites
//   node scripts/run-video-edit-tests.js --only ass,ops  suites whose name contains any listed token
//   node scripts/run-video-edit-tests.js --skip cards    exclude suites (e.g. slow real renders)
//   node scripts/run-video-edit-tests.js --timeout-min 10
// Exit code 1 when any suite fails or times out.

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.resolve(__dirname, "..");
const SCRIPTS = __dirname;

function argList(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean);
}
const only = argList("--only");
const skip = argList("--skip") || [];
const timeoutMin = Number((argList("--timeout-min") || [])[0]) || 12;

const suites = fs.readdirSync(SCRIPTS)
  .filter((f) => /^video_edit_.+\.test\.cjs$/.test(f) || f === "generation_mode.test.cjs")
  .sort()
  .filter((f) => !only || only.some((tok) => f.includes(tok)))
  .filter((f) => !skip.some((tok) => f.includes(tok)));

if (!suites.length) {
  console.error("[test:edit] no suites matched");
  process.exit(1);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  else { try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* gone */ } } }
}

function runSuite(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    let tail = "";
    const child = spawn(process.execPath, [path.join("scripts", file)], {
      cwd: SERVER_ROOT, windowsHide: true, detached: process.platform !== "win32",
      env: { ...process.env, VIDEO_EDIT_SKIP_CONFIG: "1", NODE_ENV: "test" },
    });
    const onData = (buf) => { tail = (tail + buf.toString("utf8")).slice(-6000); };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMin * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      // Most suites print "N passed, M failed"; the policy suite prints only "N passed".
      const all = [...tail.matchAll(/(\d+) passed(?:,? (\d+) failed)?/g)];
      const last = all.length ? all[all.length - 1] : null;
      const m = last ? [last[0], last[1], last[2] ?? (code === 0 ? "0" : null)] : null;
      resolve({
        file, code, timedOut, ms: Date.now() - started,
        passed: m ? Number(m[1]) : null, failed: m && m[2] != null ? Number(m[2]) : null, tail,
      });
    });
  });
}

(async () => {
  const results = [];
  for (const file of suites) {
    process.stdout.write(`[test:edit] ${file} … `);
    const r = await runSuite(file);
    results.push(r);
    const ok = !r.timedOut && r.code === 0;
    console.log(`${ok ? "ok" : r.timedOut ? "TIMEOUT" : "FAIL"} ${r.passed ?? "?"}/${r.failed ?? "?"} (${Math.round(r.ms / 1000)}s)`);
    if (!ok) console.log(r.tail.split("\n").filter((l) => /FAIL|Error|assert/i.test(l)).slice(0, 12).map((l) => `    ${l}`).join("\n"));
  }
  const bad = results.filter((r) => r.timedOut || r.code !== 0);
  const total = results.reduce((a, r) => ({ p: a.p + (r.passed || 0), f: a.f + (r.failed || 0) }), { p: 0, f: 0 });
  console.log(`\n[test:edit] ${results.length} suites · ${total.p} passed · ${total.f} failed · ${bad.length} suite(s) not green`);
  if (bad.length) console.log(`[test:edit] not green: ${bad.map((r) => r.file).join(", ")}`);
  process.exit(bad.length ? 1 : 0);
})();
