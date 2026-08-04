// Boot-time model health check.
//
// A stage whose model id doesn't resolve FAILS OPEN — the Creative Director passes every
// asset through unreviewed, the Art/Audio directors fall back to their deterministic
// defaults — with only a warn line. So a typo'd or stale model id degrades quality
// *invisibly*. This catches that at boot instead.
//
// TWO PROVIDERS, TWO KINDS OF CHECK, because they expose different things:
//
//   KIE (every LLM stage) — has NO /models endpoint (verified: 404). What CAN go wrong is
//     a stage pinned to a model with no entry in llm.primary.models, which throws at that
//     stage's first call, i.e. mid-render. So KIE ids are validated OFFLINE against the
//     configured endpoint map — no network, no false alarms.
//
//   OpenRouter (voiceover only) — still serves audio.ttsModel and DOES publish /models,
//     so that one id is verified live.
//
// Best-effort throughout: a fetch failure (offline / provider hiccup) is a single info
// line and never blocks boot. Disable with MODEL_HEALTHCHECK=0.

const config = require("./../config");

// Every model id the app will dispatch, with the labels that use it (so the warning
// names the affected agents).
function configuredModels() {
  const ids = new Map(); // id -> Set<label>
  const add = (id, label) => {
    if (!id || typeof id !== "string" || id === "default" || id === "fast") return;
    if (!ids.has(id)) ids.set(id, new Set());
    ids.get(id).add(label);
  };
  const p = config.llm?.primary || {};
  add(p.model, "default");
  add(p.fallbackModel, "fallback");
  for (const [stage, id] of Object.entries(p.stageModels || {})) add(id, `stage:${stage}`);
  return ids;
}

// Which provider bills a given id — mirrors openrouter.endpointFor, kept local to
// avoid pulling the whole client (and its config side effects) into a boot check.
function providerOf(id) {
  const entry = (config.llm?.primary?.models || {})[id];
  return entry && entry.provider === "openrouter" ? "openrouter" : "kie";
}

async function fetchOpenRouterIds({ timeoutMs }) {
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

  const missing = [];

  // ---- Endpoint map: every referenced id, either provider, must be declared.
  const wanted = configuredModels();
  const endpoints = config.llm?.primary?.models || {};
  const hasLegacyBase = !!config.llm?.primary?.baseUrl;
  for (const [id, labels] of wanted) {
    if (!endpoints[id]?.baseUrl && !hasLegacyBase) {
      missing.push({ id, labels: [...labels], where: 'llm.primary.models' });
    }
  }

  // ---- OpenRouter: ids it actually serves ARE verifiable live (it publishes /models,
  // KIE does not). That is the voiceover plus every stage pinned to an
  // provider:"openrouter" model — a typo'd light-tier id would otherwise fail open on
  // every call, quietly falling back to the KIE model it was meant to replace and
  // costing more than before the change, with no signal anywhere.
  const orIds = new Map(); // id -> labels
  for (const [id, labels] of wanted) {
    if (providerOf(id) === "openrouter" && endpoints[id]?.baseUrl) orIds.set(id, [...labels]);
  }
  const ttsModel = config.audio?.ttsModel;
  if (ttsModel) orIds.set(ttsModel, [...(orIds.get(ttsModel) || []), "tts/voiceover"]);

  let checkedOr = 0;
  if (orIds.size) {
    try {
      const available = await fetchOpenRouterIds({ timeoutMs });
      checkedOr = orIds.size;
      for (const [id, labels] of orIds) {
        if (!available.has(id)) missing.push({ id, labels, where: "OpenRouter" });
      }
    } catch (e) {
      // Never block boot on the provider being unreachable.
      console.log(`[model-health] OpenRouter id(s) unverified (${String(e?.message || e).slice(0, 60)})`);
    }
  }

  const checked = wanted.size + checkedOr;
  if (missing.length) {
    console.error("========================================================================");
    console.error("[model-health] CONFIGURED MODEL ID(S) DO NOT RESOLVE:");
    for (const m of missing) console.error(`[model-health]   ✗ "${m.id}"  (${m.where}) — used by: ${m.labels.join(", ")}`);
    console.error("[model-health] These stages will FAIL OPEN and silently do nothing");
    console.error("[model-health] (Creative Director passes every asset; Art/Audio use defaults).");
    console.error("[model-health] Fix the id in config.json or the *_MODEL env vars.");
    console.error("========================================================================");
  } else {
    console.log(`[model-health] ok — ${checked} configured model id(s) all resolve (${[...wanted.keys()].map((id) => `${id}@${providerOf(id)}`).join(", ") || "none"})`);
  }
  return { checked, missing };
}

module.exports = { checkModels };
