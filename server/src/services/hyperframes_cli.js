// How to invoke the hyperframes CLI — resolved once, shared by every caller.
//
// `npx --yes hyperframes@<pin>` re-resolves the package on EVERY invocation.
// Measured on a warm machine: 6.4s / 7.9s / 7.0s just to reach the CLI, versus
// 0.8-1.0s spawning the installed dist/cli.js directly. That cost is paid more
// than once per job — the renderer runs for the main cut plus every repair lap,
// and the validator runs `lint` and `inspect` on each composition attempt — so a
// job was spending tens of seconds doing nothing but resolving a package it
// already had.
//
// The local copy is used ONLY when its version exactly matches the configured
// pin. That pin exists so renders are deterministic and immune to npm
// publish-propagation races; a stale node_modules quietly running a different
// engine version is precisely the failure it prevents, so a mismatch falls back
// to npx rather than silently winning. A machine that never installed
// hyperframes behaves exactly as it did before.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

const WINDOWS = process.platform === "win32";

const PIN = config.render?.hyperframesVersion || null;
const SPEC = PIN ? `hyperframes@${PIN}` : "hyperframes";

// Memoized including the negative result, so a miss costs one resolve for the
// life of the process rather than one per invocation.
let _cli;
function localCli() {
  if (_cli !== undefined) return _cli;
  _cli = null;
  try {
    const pkgPath = require.resolve("hyperframes/package.json");
    const pkg = require(pkgPath);
    if (PIN && pkg.version !== PIN) {
      console.warn(`[hyperframes] local ${pkg.version} != pinned ${PIN} — using npx to honour the pin`);
      return _cli;
    }
    const rel = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin && pkg.bin.hyperframes);
    if (!rel) return _cli;
    const abs = path.join(path.dirname(pkgPath), rel);
    if (!fs.existsSync(abs)) return _cli;
    _cli = abs;
    console.log(`[hyperframes] using local CLI ${pkg.version} — skips the ~7s npx resolve per invocation`);
  } catch { /* not installed → npx */ }
  return _cli;
}

/**
 * Build the { cmd, args } for a hyperframes subcommand.
 * `subArgs` is everything after the subcommand name, e.g.
 *   cliFor("render", ["--output", "out.mp4"])
 *   cliFor("lint")
 * Callers keep using spawnCompat exactly as before — only the program and the
 * leading args change.
 */
function cliFor(sub, subArgs = []) {
  const local = localCli();
  const tail = [sub, ...subArgs];
  return local
    ? { cmd: process.execPath, args: [local, ...tail], via: "local" }
    : { cmd: WINDOWS ? "npx.cmd" : "npx", args: ["--yes", SPEC, ...tail], via: "npx" };
}

module.exports = { cliFor, localCli, SPEC, PIN };
