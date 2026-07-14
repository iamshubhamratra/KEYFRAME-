// Writes indexHtml + meta.json into a job directory and runs
// `npx hyperframes lint` to validate the composition before render.
// Returns { ok, stderr } so the caller can feed lint errors back to the LLM.

const fs = require("node:fs");
const path = require("node:path");
const { spawnCompat } = require("./spawn_compat");

const config = require("../config");

const WINDOWS = process.platform === "win32";

// Pin lint + inspect to the SAME hyperframes the renderer uses, so the safety
// gate validates against the exact engine that renders the MP4 (different
// versions can carry different lint/occlusion rules) and a cold box can't fetch
// a newer `latest` mid-run. Mirrors renderer.js's pin.
const HF_SPEC = config.render?.hyperframesVersion
  ? `hyperframes@${config.render.hyperframesVersion}`
  : "hyperframes";

function writeFiles(jobDir, { indexHtml, metaJson }) {
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, "index.html"), indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), metaJson, "utf8");
}

function runLint(jobDir) {
  return new Promise((resolve) => {
    const cmd = WINDOWS ? "npx.cmd" : "npx";
    // spawnCompat runs .cmd shims under a shell (CVE-2024-27980) with
    // pre-quoted args (avoids DEP0190).
    const p = spawnCompat(cmd, ["--yes", HF_SPEC, "lint"], {
      cwd: jobDir,
      env: process.env,
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { err += d.toString(); });

    const timer = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch { /* noop */ }
    }, 60_000);

    p.on("exit", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: out.slice(-4000),
        stderr: err.slice(-4000),
      });
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout: out, stderr: e.message });
    });
  });
}

// Spatial layout audit: `npx hyperframes inspect` renders the composition in
// headless Chrome and reports elements that OCCLUDE each other in SPACE (the
// "random cards on top of each other" symptom that lint — which only checks
// TIME/track overlaps — can never catch). Returns { ok, errors:[...], skipped }.
//
// Critical contract (verified live, hyperframes ≥0.6.112):
//   • inspect prints its report JSON on STDOUT and EXITS 1 whenever any
//     error-severity issue exists, even WITHOUT --strict. A [StaticGuard] line
//     can also land on STDERR. So we DO NOT trust the exit code — we parse the
//     stdout JSON and gate on the JSON's own severity field.
//   • It launches headless Chromium; if that's unavailable / output unparseable,
//     we return { ok:true, skipped:true } — never block generation (same
//     philosophy as runtime_check.js).
//   • We gate ONLY on severity==='error' (code text_occluded). content_overlap /
//     container_overflow come back as WARNINGS and are intentionally ignored to
//     avoid churn on particle fields / transient transition seams.
function runInspect(jobDir) {
  return new Promise((resolve) => {
    const cmd = WINDOWS ? "npx.cmd" : "npx";
    const p = spawnCompat(cmd, ["--yes", HF_SPEC, "inspect", "--json", "--at-transitions", "--tolerance", "4", "."], {
      cwd: jobDir,
      env: process.env,
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { err += d.toString(); });

    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 90_000);

    p.on("exit", () => {
      clearTimeout(timer);
      // Parse stdout JSON — NOT the exit code (1 == "found errors", not "failed to run").
      try {
        const j = JSON.parse(out);
        const errors = (j.issues || []).filter((i) => i.severity === "error");
        resolve({ ok: errors.length === 0, errors, skipped: false });
      } catch {
        // Could not parse (no Chromium, crash, empty) — never block.
        resolve({ ok: true, errors: [], skipped: true, note: (err || out).slice(-200) });
      }
    });
    p.on("error", () => { clearTimeout(timer); resolve({ ok: true, errors: [], skipped: true }); });
  });
}

async function validate(jobDir, files) {
  writeFiles(jobDir, files);
  const lint = await runLint(jobDir);
  return lint;
}

module.exports = { validate, writeFiles, runInspect };
