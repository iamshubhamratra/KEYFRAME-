// Pixabay official API provider (images + videos). Key-gated:
// config.assetProviders.pixabay.apiKey (falls back to legacy
// config.audio.pixabayKey). Rate limit: 100 req / 60s.

const config = require("../../config");
const { UA } = require("./util");

function apiKey() {
  const k = config.assetProviders?.pixabay?.apiKey || config.audio?.pixabayKey || "";
  return /YOUR_/.test(k) ? "" : k; // ignore the template placeholder
}

function orientationParam(o) {
  if (o === "vertical") return "vertical";
  if (o === "horizontal") return "horizontal";
  return "all";
}

// Pixabay rejects q longer than 100 characters with HTTP 400. Composed queries
// (subject + planner query + pack photoMod) can exceed that, so trim on a word
// boundary — dropping trailing style terms beats erroring out of the provider.
const MAX_QUERY_LEN = 100;
function clampQuery(q) {
  const s = String(q || "").trim();
  if (s.length <= MAX_QUERY_LEN) return s;
  const cut = s.slice(0, MAX_QUERY_LEN);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
}

// A REJECTED KEY IS A DEAD PROVIDER, NOT A FAILED QUERY.
//
// Measured live: every image search in a real job returned `pixabay HTTP 400`,
// and the body says why — "[ERROR 400] Invalid API key. Note: This value is
// case-sensitive." The provider still advertised itself as available, so every
// one of a film's ~13 asset lookups paid a doomed round-trip and then fell
// through to the ~12s headless page-scrape fallback. Most never finished, the
// film shipped with 3 of 13 requested pictures, and the scenes left empty were
// filled with whatever else was lying around — which is exactly the "the script
// says one thing and the asset shows another" complaint.
//
// The old code could not tell "this key is wrong" from "this query found
// nothing": both surfaced as a thrown HTTP 400 and were swallowed by the caller.
// So: read the body, latch on an auth rejection, and say so ONCE, loudly. After
// that the provider reports itself unavailable and the search skips straight to
// the working fallbacks instead of buying the same 400 twelve more times.
let keyRejected = false;
function keyIsRejected() { return keyRejected; }

// A MISSING key is even quieter than a rejected one: `available()` is false, so
// search() is never called, no request is ever made, and nothing is ever logged —
// the operator sees only the symptom (a film with three pictures, all scraped).
// Say it once, at load, and name the field to fix. Never the value.
if (!apiKey()) {
  console.warn(
    "[pixabay] no API key in assetProviders.pixabay.apiKey (server/config.json) — every image/video lookup " +
    "falls back to the slow site scraper. Free key: https://pixabay.com/api/docs/"
  );
}

async function apiJson(endpoint, params) {
  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    let body = "";
    try { body = (await resp.text()).slice(0, 200); } catch { /* body is a bonus */ }
    if ((resp.status === 400 || resp.status === 401 || resp.status === 403) && /invalid api key|authentication/i.test(body)) {
      if (!keyRejected) {
        keyRejected = true;
        console.error(
          `[pixabay] API KEY REJECTED — ${body.trim()}\n` +
          `[pixabay] Every image/video lookup will now SKIP the Pixabay API and fall back to slower scraped sources,\n` +
          `[pixabay] which materially reduces how many assets a film gets. Fix assetProviders.pixabay.apiKey in\n` +
          `[pixabay] server/config.json (get a free key at https://pixabay.com/api/docs/) to restore full asset supply.`
        );
      }
      throw new Error(`pixabay API key rejected (${resp.status})`);
    }
    throw new Error(`pixabay HTTP ${resp.status}${body ? ` — ${body.trim()}` : ""}`);
  }
  return resp.json();
}

// THE DIMENSIONS PIXABAY REPORTS ARE NOT THE DIMENSIONS PIXABAY SENDS.
//
// `imageWidth`/`imageHeight` describe the photographer's master upload — often
// 5000px+. None of the URLs in the response serve it: fullHDURL caps the long
// edge at 1920, largeImageURL at 1280, webformatURL at 640. A standard key gets
// NO fullHDURL at all (verified: `fullHD? false` on every hit), so every image a
// film downloads is a 1280px file. Measured on three live hits: reported
// 5400x3375 / 2592x1769 / 5868x4004, downloaded 1280x800 / 1280x874 / 1280x873.
//
// Passing the master dimensions to the ranker meant scoreCandidate's quality
// term — min(1, longEdge/1920) — returned 1.0 for essentially EVERY Pixabay
// candidate, because essentially every stock master is over 1920px. A term with
// the same value for all candidates cannot order any of them, so the 0.20 weight
// it carries was doing nothing at all, and the MIN_LONG_EDGE floor in
// rankCandidates was measuring a file that was never fetched.
//
// Reporting the delivered size restores both: a hit whose master is smaller than
// the cap really does arrive softer, and now really does rank below one that
// fills the cap. The cap never upscales, so delivered = min(master, cap) with
// the aspect ratio preserved.
const URL_LONG_EDGE_CAP = { fullHD: 1920, large: 1280, webformat: 640 };
function capFor(h, url) {
  if (url && url === h.fullHDURL) return URL_LONG_EDGE_CAP.fullHD;
  if (url && url === h.largeImageURL) return URL_LONG_EDGE_CAP.large;
  if (url && url === h.webformatURL) return URL_LONG_EDGE_CAP.webformat;
  return 0; // unknown URL shape: report the master rather than invent a number
}
function deliveredDims(width, height, cap) {
  const w = Number(width) || 0, h = Number(height) || 0;
  const long = Math.max(w, h);
  if (!w || !h || !cap || long <= cap) return { width: w || undefined, height: h || undefined };
  const k = cap / long;
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

async function search({ query, type, orientation, limit = 5 }) {
  if (!apiKey() || keyRejected) return [];

  if (type === "image") {
    const data = await apiJson("https://pixabay.com/api/", {
      // "all" = photos + illustrations + vectors, so a query adaptively returns
      // the right kind (a "developer desk" → photo, a "rocket icon" → vector).
      q: clampQuery(query), image_type: "all",
      orientation: orientationParam(orientation),
      per_page: limit, safesearch: "true",
    });
    return (data.hits || []).map((h) => {
      // fullHDURL (1920px) when the account exposes it; else largeImageURL
      // (1280px). Prefer the larger so full-bleed stills stay sharp at 1080p.
      const url = h.fullHDURL || h.largeImageURL || h.webformatURL;
      // …and REPORT THE FILE WE WILL ACTUALLY DOWNLOAD, not the original. See
      // deliveredDims: imageWidth/imageHeight describe the master upload, which
      // is not what any of these URLs serves.
      const dims = deliveredDims(h.imageWidth, h.imageHeight, capFor(h, url));
      return {
        url,
        width: dims.width, height: dims.height,
        tags: h.tags, // comma-separated keywords — drives relevance ranking
        license: "Pixabay Content License",
        sourceUrl: h.pageURL,
      };
    }).filter((c) => c.url);
  }

  if (type === "video") {
    const data = await apiJson("https://pixabay.com/api/videos/", {
      q: clampQuery(query),
      orientation: orientationParam(orientation),
      per_page: limit, safesearch: "true",
    });
    return (data.hits || []).map((h) => {
      const v = h.videos || {};
      const pick = v.medium || v.small || v.large || v.tiny;
      return pick && pick.url ? {
        url: pick.url,
        width: pick.width, height: pick.height,
        tags: h.tags,
        license: "Pixabay Content License",
        sourceUrl: h.pageURL,
      } : null;
    }).filter(Boolean);
  }

  return [];
}

// `available` goes false once the key is rejected, so the router stops offering a
// provider that cannot answer — otherwise every lookup keeps buying the same 400.
module.exports = { name: "pixabay", types: ["image", "video"], available: () => !!apiKey() && !keyRejected, search, keyIsRejected, deliveredDims, capFor };
