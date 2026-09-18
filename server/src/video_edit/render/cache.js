// VIDEO EDIT RENDER CACHE — content-addressed intermediates under render/cache/<level>/ (RENDER.md §9).
//
// WHY THIS EXISTS. A small edit must not re-render the whole video: replacing one B-roll re-encodes one conform and
// the composite, a music change re-runs only the mix. That works only if every intermediate is named by the hash of
// exactly what produced it, is written under a temp name and renamed into place (a killed render never leaves a
// half-written file that a later render trusts), and two renders asking for the same key at the same time build it
// once. Keys never include output-time offsets where the level allows it (A-roll chunks), so toggling an early cut
// keeps later chunks cached.
//
// CONTRACT:
//   LEVELS = ['aroll','base','voice','ass','composite','mix']
//   relPathFor(level, key, ext) -> 'render/cache/<level>/<key>.<ext>'
//   getOrMake({ projectDir, level, key, ext, runId, make: async (tmpAbs, tmpRel) => void, validate?: (abs) => bool })
//     -> Promise<{ path (abs), relPath, cached:boolean }>
//     cached when the file exists, is non-empty and passes `validate`; otherwise make() writes tmpAbs
//     (`<final>.tmp.<runId>.<ext>`, same directory) which is renamed over the final path. The temp file is always
//     removed on failure. Concurrent callers with the same final path share one build (in-process).
//   keyOf(obj) -> sha1 hex of canonical JSON
//   touch(abs) — refresh mtime so retention keeps recently used intermediates

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const fsx = require("../fsx");
const { EditError } = require("../errors");

const LEVELS = Object.freeze(["aroll", "base", "voice", "ass", "composite", "mix"]);
const KEY_RE = /^[0-9a-f]{16,64}$/;
const EXT_RE = /^[a-z0-9]{1,5}$/;
const inflight = new Map();

function relPathFor(level, key, ext) {
  if (!LEVELS.includes(level)) throw new EditError("CACHE_BAD_LEVEL", { errorClass: "bug", detail: String(level) });
  if (!KEY_RE.test(key)) throw new EditError("CACHE_BAD_KEY", { errorClass: "bug", detail: String(key).slice(0, 80) });
  if (!EXT_RE.test(ext)) throw new EditError("CACHE_BAD_EXT", { errorClass: "bug", detail: String(ext) });
  return `render/cache/${level}/${key}.${ext}`;
}

function keyOf(obj) { return crypto.createHash("sha1").update(fsx.canonicalJson(obj)).digest("hex"); }

function touch(abs) { const t = new Date(); try { fs.utimesSync(abs, t, t); } catch { /* best effort */ } }

function usable(abs, validate) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size <= 0) return false;
    return typeof validate === "function" ? !!validate(abs) : true;
  } catch { return false; }
}

async function getOrMake({ projectDir, level, key, ext, runId = "run", make, validate = null }) {
  if (typeof make !== "function") throw new EditError("CACHE_BAD_MAKE", { errorClass: "bug" });
  const relPath = relPathFor(level, key, ext);
  const abs = path.join(projectDir, relPath);
  if (usable(abs, validate)) { touch(abs); return { path: abs, relPath, cached: true }; }
  if (inflight.has(abs)) {
    await inflight.get(abs);
    if (usable(abs, validate)) return { path: abs, relPath, cached: true };
  }
  const rid = String(runId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48) || "run";
  const tmpRel = `${relPath}.tmp.${rid}.${ext}`;
  const tmpAbs = path.join(projectDir, tmpRel);
  const job = (async () => {
    fsx.ensureDir(path.dirname(abs));
    try {
      await make(tmpAbs, tmpRel);
      const st = fs.statSync(tmpAbs);
      if (!st.isFile() || st.size <= 0) throw new EditError("CACHE_EMPTY_OUTPUT", { errorClass: "bug", detail: level });
      fsx.renameWithRetrySync(tmpAbs, abs);
    } finally {
      try { fs.unlinkSync(tmpAbs); } catch { /* renamed or never written */ }
    }
  })();
  const entry = job.catch(() => {});
  inflight.set(abs, entry);
  try { await job; } finally { if (inflight.get(abs) === entry) inflight.delete(abs); }
  return { path: abs, relPath, cached: false };
}

module.exports = { LEVELS, relPathFor, getOrMake, keyOf, touch };
