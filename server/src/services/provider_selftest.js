// STOCK PROVIDER SELF-TEST — one search per keyed provider, at boot.
//
// A rejected key used to be invisible until it had already cost a film its
// pictures: `available()` only checks that a key EXISTS, so every one of a
// job's ~13 lookups paid a doomed round-trip and fell through to the ~12s
// headless scrape. Measured on a shipped film, 1 of 7 requested stock photos
// arrived. The failure belongs at boot, in one line, not spread across a paid
// render. Non-blocking and fail-open: this never stops the server starting.

const config = require("../config");

async function probePixabay() {
  const key = config.assetProviders?.pixabay?.apiKey || config.audio?.pixabayKey || "";
  if (!key || /YOUR_/.test(key)) {
    return "[assets] ⚠ no pixabay key set — stock imagery comes from openverse only (config.assetProviders.pixabay.apiKey / PIXABAY_API_KEY)";
  }
  const res = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key.trim())}&q=office&per_page=3`, { signal: AbortSignal.timeout(8000) });
  if (res.status === 200) return "[assets] pixabay key OK";
  const body = (await res.text()).slice(0, 80);
  return `[assets] ⚠ PIXABAY KEY REJECTED (HTTP ${res.status}: ${body}) — stock imagery falls back to openverse + a ~12s page scrape. Put a valid key in config.assetProviders.pixabay.apiKey (or PIXABAY_API_KEY); a free one takes a minute at https://pixabay.com/api/docs/`;
}

// Runs shortly after boot so it never delays `listen`.
function scheduleProviderSelfTest(delayMs = 1500) {
  setTimeout(() => {
    probePixabay()
      .then((line) => console.log(line))
      .catch((e) => console.log(`[assets] provider self-test skipped: ${String(e.message).slice(0, 60)}`));
  }, delayMs).unref?.();
}

module.exports = { scheduleProviderSelfTest };
