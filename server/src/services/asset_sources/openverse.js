// Openverse provider — free, keyless API over openly-licensed media.
// Images only (Openverse serves images + audio; no video).
// Docs: https://api.openverse.org/v1/

const UA = "keyframe-studio/0.1 (asset fetcher)";

// A DEAD PROVIDER MUST NOT BE RETRIED FOR EVERY ASSET OF EVERY FILM. Openverse
// has no key to reject, so unlike the Pixabay provider it had no way to take
// itself out of the rotation: when its search endpoint stopped answering (its
// host still returns 302, the /v1/images/ query just never completes) every
// lookup in every film paid the full timeout before falling through to the next
// source. On a 12-scene film that is minutes of wall clock spent on nothing.
// Three consecutive failures is enough to call it: a healthy provider does not
// fail three times in a row, and a single success resets the count.
const MAX_CONSECUTIVE_FAILURES = 3;
let consecutiveFailures = 0;
let reportedDown = false;

// 20s was longer than the whole rest of the lookup. A stock search that has not
// answered in 8 is not going to win the race against a provider that answers in
// one, and the caller still has the scraper behind it.
const TIMEOUT_MS = 8_000;

function available() {
  return consecutiveFailures < MAX_CONSECUTIVE_FAILURES;
}

function noteFailure(err) {
  consecutiveFailures++;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !reportedDown) {
    reportedDown = true;
    console.warn(
      `[openverse] ${consecutiveFailures} consecutive failures (last: ${String((err && err.message) || err).slice(0, 80)}) — ` +
      `dropping this provider for the rest of the process so it stops costing ${TIMEOUT_MS / 1000}s per lookup. ` +
      `Remaining image sources: whatever else is configured in assetProviders.order.`
    );
  }
}

async function search({ query, type, orientation, limit = 5 }) {
  if (type !== "image") return [];
  if (!available()) return [];
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("mature", "false");
  if (orientation === "horizontal") url.searchParams.set("aspect_ratio", "wide");
  if (orientation === "vertical") url.searchParams.set("aspect_ratio", "tall");

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => { noteFailure(e); throw e; });
  if (!resp.ok) { const e = new Error(`openverse HTTP ${resp.status}`); noteFailure(e); throw e; }
  const data = await resp.json().catch((e) => { noteFailure(e); throw e; });
  consecutiveFailures = 0;                        // it answered — it is alive again

  return (data.results || [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      width: r.width || null,
      height: r.height || null,
      license: `${(r.license || "unknown").toUpperCase()} ${r.license_version || ""}`.trim(),
      sourceUrl: r.foreign_landing_url || r.url,
      title: r.title || null,
      tags: Array.isArray(r.tags) ? r.tags.map((t) => t && t.name).filter(Boolean).join(" ") : null,
    }));
}

module.exports = { name: "openverse", types: ["image"], available, search };
