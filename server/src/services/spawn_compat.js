// spawn() wrapper for Windows .cmd shims (npx.cmd etc.).
//
// Two constraints collide on Windows:
//   • Node ≥18.20 throws EINVAL when spawning a .cmd file without a shell
//     (CVE-2024-27980), so `shell: true` is mandatory for npx.cmd.
//   • Node ≥22.14 emits DEP0190 (future error) when an args ARRAY is combined
//     with `shell: true`, because the args are concatenated unescaped.
//
// Resolution: when a shell is required, quote each arg ourselves and pass ONE
// command string (the documented-safe form). Elsewhere spawn directly, no shell.

const { spawn } = require("node:child_process");

const WINDOWS = process.platform === "win32";

// cmd.exe quoting: wrap args containing whitespace or cmd metacharacters in
// double quotes. Args with embedded double quotes are rejected — nothing in
// this codebase produces them, and cmd.exe cannot escape them reliably.
function quoteForCmd(arg) {
  const s = String(arg);
  if (s.includes('"')) throw new Error(`spawn_compat: unsupported '"' in arg: ${s}`);
  return /[\s&|<>^%()!,;=]/.test(s) ? `"${s}"` : s;
}

// Drop-in for spawn(cmd, args, opts). Uses a shell only when the target is a
// Windows .cmd shim; then the full command is pre-quoted into a single string.
function spawnCompat(cmd, args = [], opts = {}) {
  if (WINDOWS && /\.(cmd|bat)$/i.test(cmd)) {
    const command = [quoteForCmd(cmd), ...args.map(quoteForCmd)].join(" ");
    return spawn(command, { ...opts, shell: true });
  }
  return spawn(cmd, args, { ...opts, shell: false });
}

// Kill a spawned child AND its whole process tree. On Windows the shell:true
// path above means `child` is a cmd.exe shim — child.kill() kills only the
// shim while the real node/hyperframes/Chromium grandchildren live on as
// zombies eating the exact commit memory the watchdog was protecting against
// (0xC0000142). taskkill /T walks the tree. POSIX keeps plain SIGKILL.
function killTree(child) {
  if (!child || child.killed || child.exitCode != null) return;
  if (WINDOWS && child.pid) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false })
        .on("error", () => { try { child.kill("SIGKILL"); } catch { /* noop */ } });
      return;
    } catch { /* fall through */ }
  }
  try { child.kill("SIGKILL"); } catch { /* noop */ }
}

module.exports = { spawnCompat, killTree };
