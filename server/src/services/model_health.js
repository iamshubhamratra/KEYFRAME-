// Boot-time model health check.
//
// The three LLM directors (Creative / Audio / Art) and the pinned per-stage models
// dispatch to config.llm.baseUrl (the direct provider — OpenRouter) with an EXPLICIT
// model id. If that id doesn't resolve at the provider, openrouter.chat() errors and
// the agent FAILS OPEN — the Creative Director passes every asset through unreviewed,
// the Art/Audio directors fall back to their deterministic defaults — with only a
// warn line. So a typo'd or stale model id degrades quality *invisibly*.
//
// This probe validates every configured model id against the provider's live model
// list once at boot and logs a LOUD error for any that don't resolve. Best-effort:
// a fetch failure (offline / provider hiccup) is a single info line and never blocks
// boot. Disable with MODEL_HEALTHCHECK=0.

const config = require("./../config");

// Every model id the app will dispatch to the direct provider, with the labels that
// use it (so the warning names the affected agents).
function configuredModels() {
  const ids = new Map(); // id -> Set<label>
  const add = (id, label) => {
    if (!id || typeof id !== "string") return;
    if (!ids.has(id)) ids.set(id, new Set());
    ids.get(id).add(label);
  };
  add(config.creativeDirector?.model, "creative_director");
  add(config.audioDirector?.model, "audio_director");
  add(config.artDirector?.model, "art_director");
  // Per-stage pinned models (these are dispatched with an explicit model arg too).
  const sm = config.llm?.stageModels || {};
  for (const [stage, id] of Object.entries(sm)) add(id, `stage:${stage}`);
  return ids;
}

async function fetchAvailableIds({ timeoutMs }) {
  const base = String(config.llm?.baseUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("llm.baseUrl not configured");
  const headers = {};
  if (config.llm?.apiKey) headers.Authorization = `Bearer ${config.llm.apiKey}`;
  const resp = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new Error(`models endpoint HTTP ${resp.status}`);
  const json = await resp.json();
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const set = new Set(list.map((m) => m && m.id).filter(Boolean));
  if (!set.size) throw new Error("provider returned an empty model list");
  return set;
}

async function checkModels({ timeoutMs = 8000 } = {}) {
  if (/^(0|false|no|off)$/i.test(String(process.env.MODEL_HEALTHCHECK || ""))) {
    return { checked: 0, missing: [], skipped: true };
  }
  const wanted = configuredModels();
  if (!wanted.size) return { checked: 0, missing: [], skipped: true };

  let available;
  try {
    available = await fetchAvailableIds({ timeoutMs });
  } catch (e) {
    // Never block boot on the provider being unreachable — quality degradation from
    // a bad id will still surface as an agent warn at runtime; this is the early net.
    console.log(`[model-health] skipped — could not verify models (${String(e?.message || e).slice(0, 80)})`);
    return { checked: 0, missing: [], skipped: true };
  }

  const missing = [];
  for (const [id, labels] of wanted) {
    if (!available.has(id)) missing.push({ id, labels: [...labels] });
  }

  if (missing.length) {
    console.error("========================================================================");
    console.error("[model-health] CONFIGURED MODEL ID(S) DO NOT RESOLVE AT THE PROVIDER:");
    for (const m of missing) console.error(`[model-health]   ✗ "${m.id}"  — used by: ${m.labels.join(", ")}`);
    console.error("[model-health] These agents will FAIL OPEN and silently do nothing");
    console.error("[model-health] (Creative Director passes every asset; Art/Audio use defaults).");
    console.error("[model-health] Fix the id in config.json or the *_MODEL env vars.");
    console.error("[model-health] See AGENT-ARCHITECTURE-AUDIT.md §4.16.");
    console.error("========================================================================");
  } else {
    console.log(`[model-health] ok — ${wanted.size} configured model id(s) all resolve at the provider`);
  }
  return { checked: wanted.size, missing };
}

module.exports = { checkModels };
