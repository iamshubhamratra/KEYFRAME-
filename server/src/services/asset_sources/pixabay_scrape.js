// Pixabay site scraper — last-resort, keyless provider. Ported from the
// pixabay-no-node-modules reference (search URL building, Cloudflare
// "Just a moment" waiter, JSON response interception, DOM fallback), but
// driving the locally cached Chrome via puppeteer-core instead of Lightpanda.
//
// Reliability tradeoff: instead of the fragile detail-page download dance we
// use the CDN preview URLs surfaced by search (https://cdn.pixabay.com/...),
// upgrading _640 previews to _1280 when available. Lower resolution than the
// API, but this provider only runs when everything else failed.
//
// Images + vector previews only; video scraping is intentionally out of scope.

const config = require("../../config");
const { findChrome } = require("../ingest/website");

const SEGMENTS = { image: "photos", vector: "vectors" };

function buildSearchUrl(category, query, page = 1) {
  const segment = SEGMENTS[category] || "photos";
  const q = encodeURIComponent(String(query).trim().replace(/\s+/g, "-"));
  const base = `https://pixabay.com/${segment}/search/${q}/`;
  return page > 1 ? `${base}?p=${page}` : base;
}

async function waitPastChallenge(page, maxMs = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const title = await page.title().catch(() => "");
    if (!/just a moment/i.test(title)) return true;
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

async function search({ query, type, limit = 5 }) {
  if (type !== "image" && type !== "vector") return [];
  const chrome = findChrome();
  if (!chrome) return [];

  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(config.assetProviders?.pixabayScrape?.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36");

    // Collect hit-like objects from any JSON the search page loads.
    const jsonHits = [];
    page.on("response", async (resp) => {
      try {
        const ct = resp.headers()["content-type"] || "";
        if (!ct.includes("json")) return;
        const body = await resp.json().catch(() => null);
        if (!body) return;
        for (const key of ["hits", "results", "items", "media"]) {
          if (Array.isArray(body[key])) jsonHits.push(...body[key]);
        }
      } catch { /* ignore */ }
    });

    await page.goto(buildSearchUrl(type, query), { waitUntil: "networkidle2", timeout: 45_000 });
    const passed = await waitPastChallenge(page);
    if (!passed) {
      console.warn(`[pixabay_scrape] Cloudflare challenge not cleared for "${query}"`);
      return [];
    }
    await new Promise((r) => setTimeout(r, 1500));

    // DOM fallback: preview <img> tags on result cards point at cdn.pixabay.com.
    const domItems = await page.evaluate(() => {
      return [...document.querySelectorAll("img[src*='cdn.pixabay.com']")]
        .map((img) => ({ previewURL: img.src, alt: img.alt || "" }))
        .filter((i) => /_\d+\.(jpe?g|png|webp)/.test(i.previewURL));
    });

    const candidates = [];
    const seen = new Set();
    const push = (url, sourceUrl) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      candidates.push({ url, license: "Pixabay Content License", sourceUrl: sourceUrl || url, width: null, height: null });
    };

    for (const h of jsonHits) {
      const preview = h.previewURL || h.webformatURL || h.thumbnailUrl || h.thumbnail;
      if (typeof preview === "string" && preview.includes("cdn.pixabay.com")) {
        // Prefer the larger rendition when the CDN has it.
        push(preview.replace(/_\d+(\.\w+)$/, "_1280$1"), h.pageURL);
        push(preview, h.pageURL);
      }
    }
    for (const d of domItems) {
      push(d.previewURL.replace(/_\d+(\.\w+)$/, "_1280$1"));
      push(d.previewURL);
    }

    console.log(`[pixabay_scrape] "${query}" -> ${candidates.length} candidate URL(s)`);
    return candidates.slice(0, limit * 2);
  } finally {
    await browser.close().catch(() => { /* noop */ });
  }
}

// `lastResort` keeps this provider OUT of the concurrent fan-out in asset_sources/index.js.
// Every other provider is one HTTP call; this one launches a full puppeteer Chrome per search
// and waits out a Cloudflare interstitial. Fanning it out would start a browser for every
// want in the film, in parallel, to fetch candidates the API providers have almost always
// already supplied. It is asked only when the concurrent pool comes back empty — which is
// precisely the "last resort" this file was written to be.
module.exports = { name: "pixabay_scrape", types: ["image", "vector"], available: () => !!findChrome(), search, lastResort: true };
