// Optional local semantic embeddings for asset scoring (Phase 2, item 2/5).
//
// OFF BY DEFAULT and deliberately NOT a package.json dependency: local embedding
// models pull in onnxruntime (native) plus a ~25–350 MB weight download at
// runtime — a real cost/risk on the lean, keyless deploy targets. The existing
// vision-relevance gate already provides semantic FILTERING, so this module is a
// pure ranking UPGRADE hook, not a correctness dependency.
//
// Enable with:  npm install @huggingface/transformers   and   USE_ASSET_EMBEDDINGS=1
// Everything degrades to a no-op when either is missing: available() → false and
// embedText() → null, so callers MUST treat a null/empty return as "unavailable,
// fall back to keyword + style ranking".
//
// Integration point (left unwired to avoid untested branches in the hot path):
//   - curated_library.search / provider ranking: re-rank survivors by
//     cosine(embedText(sceneQuery), embedText(candidateTags)) when available().
//   - asset pool: drop style-outliers by distance from the pool-embedding centroid.

let _transformers = null;
let _loadTried = false;
let _pipe = null;

function enabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.USE_ASSET_EMBEDDINGS || ""));
}

function tryLoadLib() {
  if (_loadTried) return _transformers;
  _loadTried = true;
  try { _transformers = require("@huggingface/transformers"); }
  catch { _transformers = null; } // dependency not installed — stay a no-op
  return _transformers;
}

// True only when BOTH the opt-in flag is set AND the library is installed.
function available() {
  return enabled() && !!tryLoadLib();
}

async function pipe() {
  if (_pipe) return _pipe;
  const t = tryLoadLib();
  if (!t) return null;
  const model = process.env.ASSET_EMBED_MODEL || "Xenova/all-MiniLM-L6-v2";
  _pipe = await t.pipeline("feature-extraction", model);
  return _pipe;
}

// Cosine similarity of two equal-length numeric vectors. Pure — always safe.
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Embed one string or an array of strings. Returns number[][] or null when
// embeddings are unavailable (or on any failure — fail-soft, never throw).
async function embedText(texts) {
  if (!available()) return null;
  try {
    const p = await pipe();
    if (!p) return null;
    const arr = Array.isArray(texts) ? texts : [texts];
    const out = [];
    for (const t of arr) {
      const r = await p(String(t || ""), { pooling: "mean", normalize: true });
      out.push(Array.from(r.data));
    }
    return out;
  } catch (e) {
    console.warn(`[embeddings] embedText failed: ${e.message}`);
    return null;
  }
}

module.exports = { available, enabled, cosine, embedText };
