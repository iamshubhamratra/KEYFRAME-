// Writes indexHtml + meta.json into a job directory and runs
// `npx hyperframes lint` to validate the composition before render.
// Returns { ok, stderr } so the caller can feed lint errors back to the LLM.

const fs = require("node:fs");
const path = require("node:path");
const { spawnCompat, killTree } = require("./spawn_compat");
// lint + inspect go through the SAME helper the renderer uses, so the safety
// gate validates against the exact hyperframes build that renders the MP4
// (different versions carry different lint/occlusion rules). That helper also
// owns the version pin (SPEC/PIN, from config.render.hyperframesVersion), which
// is why this module no longer builds a spec — or a raw npx command — of its own.
//
// This import was MISSING: runLint()/runInspect() below already called cliFor(),
// so both threw `ReferenceError: cliFor is not defined` on every call. Every
// gate here is fail-open, so that surfaced only as the LLM composer silently
// falling back to the deterministic scene-kit on every single render.
const { cliFor } = require("./hyperframes_cli");

function writeFiles(jobDir, { indexHtml, metaJson }) {
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, "index.html"), indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), metaJson, "utf8");
}

function runLint(jobDir) {
  return new Promise((resolve) => {
    // Prefer the installed CLI over an npx re-resolve — see hyperframes_cli.js.
    // spawnCompat runs .cmd shims under a shell (CVE-2024-27980) with
    // pre-quoted args (avoids DEP0190); a plain node path needs neither, and
    // spawnCompat passes it straight through.
    // --json for the SAME reason runInspect uses it (see its contract note below):
    // `lint` exits 1 whenever it reports ANYTHING, warnings included, so the exit
    // code cannot tell "this composition is broken" from "this composition is fine
    // but 196 divs could carry a Studio id". Measured on a real rendered film:
    // 2 errors, 196 warnings, 9 info -> exit 1. Gating on the exit code would send
    // virtually every composition back for an LLM repair lap (pipeline.js feeds
    // !ok straight into the composer feedback prompt) and burn the whole repair
    // budget on cosmetic findings. Gate on SEVERITY instead.
    const { cmd, args } = cliFor("lint", ["--json", "."]);
    const p = spawnCompat(cmd, args, {
      cwd: jobDir,
      env: process.env,
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { err += d.toString(); });

    const timer = setTimeout(() => {
      killTree(p);
    }, 60_000);

    p.on("exit", (code) => {
      clearTimeout(timer);
      let report = null;
      // Plain JSON.parse, exactly like runInspect: with --json the child'''s stdout
      // is the report and nothing else. (A lenient first-object extractor is the
      // WRONG tool here — findings embed GSAP snippets full of literal braces,
      // so brace-matching truncates the document mid-string.)
      try { report = JSON.parse(out.trim()); } catch { /* fall through */ }

      // Unparseable (a CLI too old for --json, a crash, empty output): fall back
      // to the exit code so a genuinely broken run still registers, and hand the
      // raw text back for the log.
      if (!report || !Array.isArray(report.findings)) {
        resolve({
          ok: code === 0, code, parsed: false,
          stdout: out.slice(-4000), stderr: err.slice(-4000),
        });
        return;
      }

      const errors = report.findings.filter((f) => f.severity === "error");
      const warnings = report.findings.filter((f) => f.severity === "warning");
      // The composer's repair prompt is built from stdout/stderr, so hand it ONLY
      // the blocking findings — 196 warnings of context would drown the two lines
      // that actually need fixing.
      const summary = errors
        .map((f) => f.code + ": " + f.message + (f.fixHint ? "\n" + "  Fix: " + f.fixHint : ""))
        .join("\n");

      resolve({
        ok: errors.length === 0,
        code, parsed: true,
        errorCount: errors.length,
        warningCount: warnings.length,
        errors,
        stdout: summary.slice(-4000),
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
    const { cmd, args } = cliFor("inspect", ["--json", "--at-transitions", "--tolerance", "4", "."]);
    const p = spawnCompat(cmd, args, {
      cwd: jobDir,
      env: process.env,
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { err += d.toString(); });

    const timer = setTimeout(() => { killTree(p); }, 90_000);

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
