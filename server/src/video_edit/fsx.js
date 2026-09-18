// VIDEO EDIT FILESYSTEM PRIMITIVES — crash-safe JSON, path containment, deletion that survives Windows.
//
// WHY THIS EXISTS. An edit project lives for weeks on disk and is mutated by a long pipeline that
// can be killed at any instant (dev-watch restarts, crashes, deploys). A torn project.json loses a
// user's paid analysis, and a path built from a URL segment can escape into another user's project.
// Windows adds its own failure modes: rename over a file another process (antivirus, indexer, an
// open media stream) holds fails with EPERM/EBUSY/EACCES for a few hundred ms, and `rm` of a dir
// with an open handle fails the same way. Every edit module goes through these helpers instead of
// hand-rolling fs calls.
//
// CONTRACT (ENGINE.md §3.4, §4.10):
//   ensureDir(p) -> p
//   writeJsonAtomic(file, obj, { backup=false })   sync; tmp `file.<pid>.<seq>.tmp` (flag wx) → fsync →
//        close → (backup: copy current → .bak) → rename with EPERM/EBUSY/EACCES retry ×5 (25→400 ms).
//        Throws EditError STORE_WRITE_FAILED (resource, retryable) when the rename never succeeds.
//   readJsonSafe(file) -> { ok, value, from:'primary'|'backup'|null, error:'ENOENT'|'CORRUPT'|null }
//   canonicalJson(obj) · sha256Json(obj) · sha256File(p) -> Promise<hex> · partialSha(p) -> Promise<hex>
//   resolveInside(root, rel) -> abs   (EditError PATH_ESCAPE on NUL / absolute / '..' / symlink / realpath escape)
//   isInsidePath(root, candidate) -> boolean  (case-insensitive on win32, separator-bounded)
//   moveToTrash(dir, trashDir) -> newPath · rmWithRetry(p, { attempts=5 }) -> Promise<boolean>
//   dirSizeBytes(p) -> number · statfsFreeMb(p) -> number|null

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EditError } = require("./errors");

const WIN = process.platform === "win32";
const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RETRY_DELAYS_MS = [25, 50, 100, 200, 400];
const MB = 1024 * 1024;

let tmpSeq = 0;
const sleepBuf = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) { Atomics.wait(sleepBuf, 0, 0, ms); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function renameWithRetrySync(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; }
    catch (e) {
      if (!RETRY_CODES.has(e.code) || i >= RETRY_DELAYS_MS.length) throw e;
      sleepSync(RETRY_DELAYS_MS[i]);
    }
  }
}

function writeJsonAtomic(file, obj, { backup = false } = {}) {
  const data = JSON.stringify(obj, null, 2);
  if (data === undefined) throw new EditError("STORE_WRITE_FAILED", { errorClass: "bug", detail: "value is not JSON-serializable" });
  const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
  let fd = null;
  try {
    fd = fs.openSync(tmp, "wx");
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (backup && fs.existsSync(file)) {
      try { fs.copyFileSync(file, `${file}.bak`); }
      catch { /* a failed backup must not block the primary write */ }
    }
    renameWithRetrySync(tmp, file);
  } catch (e) {
    if (fd != null) { try { fs.closeSync(fd); } catch { /* noop */ } }
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
    if (e && e.name === "EditError") throw e;
    const noSpace = e && e.code === "ENOSPC";
    throw new EditError(noSpace ? "INSUFFICIENT_STORAGE" : "STORE_WRITE_FAILED", {
      status: noSpace ? 507 : 500, errorClass: "resource", retryable: true, detail: e && e.code ? e.code : "write failed",
    });
  }
  return file;
}

function parseFile(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { return { exists: e.code !== "ENOENT", ok: false }; }
  try {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { exists: true, ok: true, value: JSON.parse(text) };
  } catch { return { exists: true, ok: false }; }
}

function readJsonSafe(file) {
  const primary = parseFile(file);
  if (primary.ok) return { ok: true, value: primary.value, from: "primary", error: null };
  const bak = parseFile(`${file}.bak`);
  if (bak.ok) return { ok: true, value: bak.value, from: "backup", error: null };
  const missing = !primary.exists && !bak.exists;
  return { ok: false, value: null, from: null, error: missing ? "ENOENT" : "CORRUPT" };
}

function canonicalize(v) {
  if (Array.isArray(v)) return v.map((x) => (x === undefined || typeof x === "function" ? null : canonicalize(x)));
  if (v && typeof v === "object") {
    if (typeof v.toJSON === "function") return canonicalize(v.toJSON());
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const x = v[k];
      if (x === undefined || typeof x === "function") continue;
      out[k] = canonicalize(x);
    }
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

function canonicalJson(obj) { return JSON.stringify(canonicalize(obj)); }
function sha256Json(obj) { return crypto.createHash("sha256").update(canonicalJson(obj)).digest("hex"); }

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = fs.createReadStream(p);
    s.on("error", reject);
    s.on("data", (d) => h.update(d));
    s.on("end", () => resolve(h.digest("hex")));
  });
}

// Fingerprint for large media: size + first 1 MB + last 1 MB. Cheap enough to run on every
// checkpoint skip decision; a truncated or replaced file changes it.
async function partialSha(p) {
  const fh = await fs.promises.open(p, "r");
  try {
    const { size } = await fh.stat();
    const h = crypto.createHash("sha256").update(`size:${size}|`);
    const n = Math.min(MB, size);
    const head = Buffer.alloc(n);
    if (n) await fh.read(head, 0, n, 0);
    h.update(head);
    if (size > MB) {
      const m = Math.min(MB, size - MB);
      const tail = Buffer.alloc(m);
      await fh.read(tail, 0, m, size - m);
      h.update(tail);
    }
    return h.digest("hex");
  } finally { await fh.close(); }
}

const cmpForm = (p) => (WIN ? path.resolve(p).toLowerCase() : path.resolve(p));

function isInsidePath(root, candidate, { allowEqual = true } = {}) {
  const a = cmpForm(root), b = cmpForm(candidate);
  if (a === b) return allowEqual;
  const withSep = a.endsWith(path.sep) ? a : a + path.sep;
  return b.startsWith(withSep);
}

function escape(detail) { return new EditError("PATH_ESCAPE", { status: 400, errorClass: "input", detail }); }

function realpathOrNull(p) {
  try { return fs.realpathSync.native(p); } catch { return null; }
}

function resolveInside(root, rel) {
  if (typeof root !== "string" || !root) throw escape("bad root");
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 1024) throw escape("bad rel");
  if (rel.includes("\0")) throw escape("nul");
  // Absolute in either flavour: POSIX '/', Windows '\', drive-relative 'C:x', UNC '\\host'.
  if (path.isAbsolute(rel) || path.win32.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || /^[\\/]/.test(rel)) throw escape("absolute");
  const segments = rel.split(/[\\/]+/);
  if (segments.some((s) => s === "..")) throw escape("dotdot");
  if (WIN && segments.some((s) => /[<>:"|?*]/.test(s))) throw escape("reserved char");

  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, rel);
  if (!isInsidePath(absRoot, abs, { allowEqual: false })) throw escape("outside");

  // Symlinks / junctions: lstat every existing component below the root; realpath prefix check
  // on the deepest existing ancestor (the target itself may not exist yet — write paths).
  const realRoot = realpathOrNull(absRoot) || absRoot;
  let cur = absRoot;
  for (const seg of path.relative(absRoot, abs).split(path.sep)) {
    if (!seg || seg === ".") continue;
    cur = path.join(cur, seg);
    let st;
    try { st = fs.lstatSync(cur); } catch { break; }
    if (st.isSymbolicLink()) throw escape("symlink");
    const real = realpathOrNull(cur);
    if (real && !isInsidePath(realRoot, real, { allowEqual: false })) throw escape("realpath outside");
  }
  return abs;
}

function moveToTrash(dir, trashDir) {
  ensureDir(trashDir);
  const base = path.basename(path.resolve(dir));
  let target = path.join(trashDir, `${base}.${Date.now()}`);
  for (let i = 1; fs.existsSync(target); i++) target = path.join(trashDir, `${base}.${Date.now()}-${i}`);
  renameWithRetrySync(dir, target);
  return target;
}

async function rmWithRetry(p, { attempts = 5 } = {}) {
  for (let i = 0; i < Math.max(1, attempts); i++) {
    try {
      await fs.promises.rm(p, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
      if (!fs.existsSync(p)) return true;
    } catch (e) {
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "EACCES", "EMFILE"].includes(e.code)) return false;
    }
    await sleep(Math.min(2000, 50 * 2 ** i));
  }
  return !fs.existsSync(p);
}

function dirSizeBytes(p) {
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    let st;
    try { st = fs.lstatSync(cur); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isFile()) { total += st.size; continue; }
    if (!st.isDirectory()) continue;
    let names = [];
    try { names = fs.readdirSync(cur); } catch { continue; }
    for (const n of names) stack.push(path.join(cur, n));
  }
  return total;
}

function statfsFreeMb(p) {
  let cur = path.resolve(p);
  for (let i = 0; i < 64; i++) {
    try {
      const st = fs.statfsSync(cur);
      return Math.floor((Number(st.bavail) * Number(st.bsize)) / MB);
    } catch (e) {
      const parent = path.dirname(cur);
      if (e.code !== "ENOENT" || parent === cur) return null;
      cur = parent;
    }
  }
  return null;
}

module.exports = {
  ensureDir, writeJsonAtomic, readJsonSafe, canonicalJson, sha256Json, sha256File, partialSha,
  resolveInside, isInsidePath, moveToTrash, rmWithRetry, dirSizeBytes, statfsFreeMb, renameWithRetrySync, sleepSync,
};
