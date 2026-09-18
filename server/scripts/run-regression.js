// TEMPLATE-FLOW REGRESSION BASELINE.
//
// WHY THIS EXISTS. The AI Video Edit mode is built additively next to the template-generation pipeline, in a working tree
// where many shared modules already carry uncommitted edits — so "all green" is not the bar; some existing suites may
// already fail before any new work. What the new feature must prove is narrower and stricter: it FLIPPED NOTHING. This
// records the pass/fail set of the existing template test and check scripts once, before the work, and compares later
// runs against it. Only a pass→fail flip fails the check; a script that was already red stays reported, not blamed.
//
// Usage (from server/):
//   node scripts/run-regression.js --save                 record the baseline
//   node scripts/run-regression.js --check                compare against the baseline (exit 1 on any pass→fail)
//   node scripts/run-regression.js --check --only a,b     subset
//   node scripts/run-regression.js --save --timeout-min 20
//
// The web lint error count is recorded too (the check fails if it grows).

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SERVER_DIR = path.resolve(__dirname, "..");
const WEB_DIR = path.resolve(SERVER_DIR, "..", "web");
const BASELINE_FILE = path.join(__dirname, "regression-baseline.local.json");
const WINDOWS = process.platform === "win32";

const DEFAULT_SCRIPTS = [
  "test:engine", "test:media", "test:director", "test:match", "test:align", "test:slots", "test:longform",
  "test:brand", "test:filmbundle", "test:alignom", "test:sbalign", "test:sbcover", "test:pacing", "test:density",
  "test:prompt-analysis", "test:prompt-scope", "test:scope-routes", "test:queries", "test:shotretry", "test:pace",
  "test:checker", "check:graph", "golden:check",
];

function parseArgs(argv) {
  const out = { mode: null, only: null, timeoutMin: 15, skipLint: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--save") out.mode = "save";
    else if (a === "--check") out.mode = "check";
    else if (a === "--only") out.only = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--timeout-min") out.timeoutMin = Math.max(1, Number(argv[++i]) || 15);
    else if (a === "--skip-lint") out.skipLint = true;
  }
  return out;
}

function killTree(child) {
  if (!child || child.exitCode != null) return;
  if (WINDOWS && child.pid) {
    try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); return; }
    catch { /* fall through */ }
  }
  try { child.kill("SIGKILL"); } catch { /* noop */ }
}

// Run a package.json script's command directly (not through `npm run`, whose .cmd shim needs a shell on Windows and
// adds its own banner). The commands in this repo are plain `node scripts/...` lines, so a shell is only a convenience.
function runCommand(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { cwd, shell: true, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0" } });
    let buf = "";
    const keep = (d) => { buf += d.toString(); if (buf.length > 200_000) buf = buf.slice(-100_000); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.on("error", (e) => { keep(`spawn error: ${e.message}`); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = buf.split(/\r?\n/).filter((l) => l.trim());
      resolve({ exitCode: timedOut ? null : code, timedOut, durationMs: Date.now() - started, tail: lines.slice(-20), output: buf });
    });
  });
}

function lintErrorCount(output) {
  // eslint summary: "✖ 8 problems (6 errors, 2 warnings)"
  const m = /(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/.exec(output);
  if (m) return { errors: Number(m[2]), warnings: Number(m[3]) };
  return { errors: 0, warnings: 0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode) {
    console.error("usage: node scripts/run-regression.js --save|--check [--only a,b] [--timeout-min N] [--skip-lint]");
    process.exit(2);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, "package.json"), "utf8"));
  const names = (args.only || DEFAULT_SCRIPTS).filter((n) => {
    if (pkg.scripts && pkg.scripts[n]) return true;
    console.warn(`[regression] skipping unknown script "${n}"`);
    return false;
  });

  const results = {};
  for (const name of names) {
    process.stdout.write(`[regression] ${name} … `);
    const r = await runCommand(pkg.scripts[name], SERVER_DIR, args.timeoutMin * 60_000);
    const pass = r.exitCode === 0;
    results[name] = { pass, exitCode: r.exitCode, timedOut: r.timedOut, durationMs: r.durationMs, tail: r.tail };
    console.log(`${pass ? "pass" : r.timedOut ? "TIMEOUT" : `FAIL (exit ${r.exitCode})`} in ${Math.round(r.durationMs / 1000)}s`);
  }

  let lint = null;
  if (!args.skipLint && fs.existsSync(path.join(WEB_DIR, "package.json"))) {
    process.stdout.write("[regression] web lint … ");
    const r = await runCommand("npx --no-install eslint .", WEB_DIR, args.timeoutMin * 60_000);
    lint = { exitCode: r.exitCode, ...lintErrorCount(r.output), tail: r.tail };
    console.log(`${lint.errors} error(s), ${lint.warnings} warning(s)`);
  }

  const snapshot = { recordedAt: new Date().toISOString(), node: process.version, results, lint };

  if (args.mode === "save") {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(snapshot, null, 2));
    const passed = Object.values(results).filter((r) => r.pass).length;
    console.log(`[regression] baseline saved: ${passed}/${names.length} passing → ${path.relative(SERVER_DIR, BASELINE_FILE)}`);
    return;
  }

  if (!fs.existsSync(BASELINE_FILE)) {
    console.error("[regression] no baseline — run with --save first");
    process.exit(2);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const flips = [];
  const fixed = [];
  for (const [name, r] of Object.entries(results)) {
    const b = base.results && base.results[name];
    if (!b) continue;
    if (b.pass && !r.pass) flips.push(name);
    if (!b.pass && r.pass) fixed.push(name);
  }
  let lintGrew = false;
  if (lint && base.lint && lint.errors > base.lint.errors) lintGrew = true;

  if (fixed.length) console.log(`[regression] now passing (was failing): ${fixed.join(", ")}`);
  if (lintGrew) console.error(`[regression] web lint errors grew: ${base.lint.errors} → ${lint.errors}`);
  if (flips.length) {
    console.error(`[regression] PASS→FAIL FLIPS: ${flips.join(", ")}`);
    for (const n of flips) console.error(`--- ${n} tail ---\n${results[n].tail.join("\n")}`);
  }
  if (flips.length || lintGrew) process.exit(1);
  console.log("[regression] no regressions against the baseline");
}

main().catch((e) => { console.error(`[regression] fatal: ${e.stack || e.message}`); process.exit(2); });
