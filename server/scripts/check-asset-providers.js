// Are the stock providers actually working? Run this when films look thin.
//
// A dead provider does not fail loudly — it degrades. Pixabay 400s on a bad key
// and the pipeline falls through to the site SCRAPER, which is slower and
// returns far less, so the only symptom is fewer pictures per scene. Measured on
// a 300 s film with a rejected key: 44 scenes asked for a visual, 24 were
// acquired, and 9 scenes ended up with a picture.
//
//   node scripts/check-asset-providers.js
//
// Exits 1 if no keyed photo provider works, so CI can catch it.

const config = require("../src/config");

function keyFor(name) {
  const ap = config.assetProviders || {};
  if (name === "pixabay") return (ap.pixabay && ap.pixabay.apiKey) || (config.audio && config.audio.pixabayKey) || "";
  if (name === "pexels") return (ap.pexels && ap.pexels.apiKey) || "";
  return "";
}

async function check(name) {
  const key = keyFor(name);
  if (!key) return { name, ok: false, why: "no API key configured" };
  try {
    if (name === "pixabay") {
      const u = new URL("https://pixabay.com/api/");
      u.searchParams.set("key", key);
      u.searchParams.set("q", "office desk");
      u.searchParams.set("image_type", "photo");
      u.searchParams.set("per_page", "3");
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      const body = await r.text();
      if (!r.ok) return { name, ok: false, why: `HTTP ${r.status} — ${body.slice(0, 80)}` };
      const hits = (JSON.parse(body).hits || []).length;
      return { name, ok: hits > 0, why: `${hits} hit(s)` };
    }
    const r = await fetch("https://api.pexels.com/v1/search?query=office%20desk&per_page=3", {
      headers: { Authorization: key }, signal: AbortSignal.timeout(20000),
    });
    const body = await r.text();
    if (!r.ok) return { name, ok: false, why: `HTTP ${r.status} — ${body.slice(0, 80)}` };
    const hits = (JSON.parse(body).photos || []).length;
    return { name, ok: hits > 0, why: `${hits} hit(s)` };
  } catch (e) {
    return { name, ok: false, why: String(e.message).slice(0, 90) };
  }
}

(async () => {
  const order = (config.assetProviders && config.assetProviders.order) || [];
  console.log("provider order: " + (order.join(" -> ") || "(none configured)") + "\n");

  const results = [];
  for (const n of ["pixabay", "pexels"]) results.push(await check(n));

  for (const r of results) {
    console.log("  " + (r.ok ? "OK  " : "DEAD") + "  " + r.name.padEnd(9) + " " + r.why);
  }
  console.log("\n  n/a   openverse  no key required (CC catalogue, thinner + more variable)");
  console.log("  n/a   pixabay_scrape  last-resort site scraper — slow, low yield");

  const live = results.filter((r) => r.ok);
  if (!live.length) {
    console.log("\nNO KEYED PHOTO PROVIDER IS WORKING.");
    console.log("Films will be thin no matter how many assets the script asks for:");
    console.log("every lookup falls through to the scraper and most scenes end up with no picture.");
    console.log("\nFix: put a working key in server/config.json");
    console.log("  assetProviders.pixabay.apiKey   free: https://pixabay.com/api/docs/");
    console.log("  assetProviders.pexels.apiKey    free: https://www.pexels.com/api/");
    process.exit(1);
  }
  console.log("\n" + live.length + " keyed provider(s) live: " + live.map((r) => r.name).join(", "));
})();
