// Writes indexHtml + meta.json into a job directory and runs
// `npx hyperframes lint` to validate the composition before render.
// Returns { ok, stderr } so the caller can feed lint errors back to the LLM.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const WINDOWS = process.platform === "win32";

function writeFiles(jobDir, { indexHtml, metaJson }) {
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, "index.html"), indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), metaJson, "utf8");
}

function runLint(jobDir) {
  return new Promise((resolve) => {
    const cmd = WINDOWS ? "npx.cmd" : "npx";
    // Node ≥18.20 throws EINVAL spawning .cmd files without a shell (CVE-2024-27980).
    const p = spawn(cmd, ["--yes", "hyperframes", "lint"], {
      cwd: jobDir,
      env: process.env,
      shell: WINDOWS,
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

async function validate(jobDir, files) {
  writeFiles(jobDir, files);
  const lint = await runLint(jobDir);
  return lint;
}

module.exports = { validate, writeFiles };
