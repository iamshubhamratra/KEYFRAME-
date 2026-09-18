// VIDEO EDIT B-ROLL DEFAULTS — tunables for stock retrieval (and, later, scoring) in one place.
//
// WHY THIS EXISTS. settings.js is owned by the engine and already validated; B-roll needs a dozen
// knobs (provider order, per-page sizes, token buckets, cache TTL, licence allow-list, the acronym
// whitelist for query cleaning) that should be overridable without touching it. So the defaults live
// here and `resolveRetrievalSettings(settings)` overlays an OPTIONAL `settings.videoEdit.broll` or
// `settings.broll` block — only values of the right type are taken, anything else is ignored (a bad
// override degrades to the default, it never breaks a pipeline).
//
// CONTRACT:
//   RETRIEVAL_DEFAULTS (deep-frozen)
//   resolveRetrievalSettings(settings) -> plain merged copy (same shape as RETRIEVAL_DEFAULTS)

const MB = 1024 * 1024;

const RETRIEVAL_DEFAULTS = deepFreeze({
  // Providers queried per media kind, in preference order (results are merged in this order).
  providers: { video: ["pexels", "pixabay"], image: ["pexels", "pixabay", "openverse"] },
  allowImages: true,
  // A video slot whose video search returns nothing usable falls back to image providers.
  imageFallback: true,
  maxQueriesPerSlot: 3,
  maxRawPerSlot: 24,
  perPage: { pexels: 15, pixabay: 20, openverse: 20 },
  timeoutMs: 15000,
  // Orientation fit: an item whose cover loss vs the output aspect exceeds this ranks after fitting ones.
  maxCoverLoss: 0.6,
  maxQueryChars: 80,
  // Process-wide token buckets. Provider limits are Pexels 200/h and Pixabay 100/60 s, but the template
  // pipeline shares the same keys (not these buckets), so B-roll keeps 10 % headroom (ANALYSIS.md §8).
  rateLimits: {
    pexels: { capacity: 180, windowMs: 60 * 60 * 1000, concurrency: 4 },
    pixabay: { capacity: 90, windowMs: 60 * 1000, concurrency: 4 },
    openverse: { capacity: 20, windowMs: 60 * 1000, concurrency: 2 },
  },
  // Longest a search waits for a token before skipping that provider (status 'rate_limited'). After the
  // first rate-limited call a stage stops asking that provider for the rest of the stage.
  rateLimitMaxWaitMs: 8000,
  // Longest a 429 / exhausted quota pauses a bucket.
  maxPenaltyMs: 60 * 60 * 1000,
  cache: { ttlMs: 24 * 60 * 60 * 1000, emptyTtlMs: 60 * 60 * 1000, maxBytes: 64 * MB, maxEntries: 5000, sweepEvery: 50 },
  // CC0 + CC BY only (ANALYSIS.md §8). 'by-sa' (ShareAlike on the adapted edit) and 'pdm' (a label, not a
  // licence grant) are explicit operator opt-ins; NC / ND are never allowed.
  openverse: { licenses: ["cc0", "by"], category: "photograph" },
  pixabay: { videoType: "film", imageType: "photo" },
  // 2–3 character (or digit-bearing) terms that query_terms.subjectQuery would drop but that are real
  // visual subjects. Ambiguous English words (it, us, pr, er, am, pm) are deliberately absent.
  queryWhitelist: [
    "AI", "AR", "VR", "XR", "UX", "UI", "2D", "3D", "4G", "5G", "TV", "PC", "EV", "DJ", "HR",
    "SEO", "API", "CRM", "ERP", "B2B", "B2C", "SAAS", "IOT", "NFT", "GPS", "DNA", "ATM", "USB", "LED",
    "GPU", "CPU", "ESG", "KPI", "ROI", "MVP", "PPE", "ICU", "MRI", "CEO", "CFO", "CTO", "4K", "8K", "VPN", "SQL", "AWS",
  ],
});

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

// Overlay `src` onto `dst` where the default's type matches: numbers must be finite and > 0 (booleans
// exactly boolean, arrays of strings, nested objects recursively). Unknown keys are ignored.
function overlay(dst, src) {
  if (!isPlain(src)) return dst;
  for (const [k, def] of Object.entries(dst)) {
    if (!(k in src)) continue;
    const v = src[k];
    if (typeof def === "number") { if (typeof v === "number" && Number.isFinite(v) && v >= 0) dst[k] = v; }
    else if (typeof def === "boolean") { if (typeof v === "boolean") dst[k] = v; }
    else if (typeof def === "string") { if (typeof v === "string" && v) dst[k] = v; }
    else if (Array.isArray(def)) { if (Array.isArray(v) && v.every((x) => typeof x === "string")) dst[k] = [...v]; }
    else if (isPlain(def)) overlay(def, v);
  }
  return dst;
}

function resolveRetrievalSettings(settings) {
  const out = clone(RETRIEVAL_DEFAULTS);
  const s = isPlain(settings) ? settings : {};
  const block = (isPlain(s.videoEdit) && isPlain(s.videoEdit.broll) && s.videoEdit.broll) || (isPlain(s.broll) && s.broll) || null;
  if (block) overlay(out, block);
  const known = new Set(["pexels", "pixabay", "openverse"]);
  out.providers.video = [...new Set(out.providers.video.filter((p) => known.has(p) && p !== "openverse"))];
  out.providers.image = [...new Set(out.providers.image.filter((p) => known.has(p)))];
  out.maxQueriesPerSlot = Math.max(1, Math.min(6, Math.floor(out.maxQueriesPerSlot) || 3));
  out.maxRawPerSlot = Math.max(1, Math.min(200, Math.floor(out.maxRawPerSlot) || 24));
  return out;
}

module.exports = { RETRIEVAL_DEFAULTS, resolveRetrievalSettings };
