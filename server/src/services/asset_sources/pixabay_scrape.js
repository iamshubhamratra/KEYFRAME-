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

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../../config");
const { findChrome } = require("../ingest/website");
const { scoreCandidate } = require("./util");

const SEGMENTS = { image: "photos", vector: "vectors" };

// ONE BROWSER, REUSED — NOT ONE PER QUERY, AND NOT ONE AT A TIME.
//
// This provider used to carry TWO guards against a Windows puppeteer temp-profile
// race: a throwaway `userDataDir` per launch, AND a queue that let only one search
// run at a time. The first guard alone already removes the race. The second was
// what made this provider the slowest thing in the pipeline.
//
// It matters far more than it looks, because the Pixabay API key is rejected, so
// EVERY image lookup falls through to this scraper. Each query was paying a full
// Chrome launch + profile-dir create/delete (~10-12s measured end to end), and the
// queue meant a 14-asset film paid that 14 times back to back — while the caller
// in graph.js was politely fetching four at a time and getting nothing for it.
//
// So: launch ONCE and keep the browser warm, hand each search its own tab, and cap
// concurrent tabs instead of serialising. One browser also means one profile
// directory, which kills the original race outright rather than working around it.
// The browser is closed after an idle period so a server that stops generating
// videos does not sit on a Chrome process.
const MAX_TABS = Number(config.assetProviders?.pixabayScrape?.maxTabs) || 3;
const IDLE_CLOSE_MS = 60_000;
let shared = null;          // { browser, profileDir }
let launching = null;       // in-flight launch, so concurrent callers share one
let live = 0;               // tabs currently open
let idleTimer = null;

async function getBrowser(chrome) {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (shared && shared.browser.connected !== false) {
    try { if (shared.browser.process() && !shared.browser.process().killed) return shared.browser; }
    catch { /* fall through and relaunch */ }
  }
  if (launching) return launching;
  const puppeteer = require("puppeteer-core");
  const profileDir = path.join(os.tmpdir(), `keyframe-pixabay-${crypto.randomUUID()}`);
  launching = puppeteer.launch({
    executablePath: chrome, headless: true, userDataDir: profileDir,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  }).then((browser) => {
    shared = { browser, profileDir };
    browser.on("disconnected", () => { if (shared && shared.browser === browser) shared = null; });
    return browser;
  }).finally(() => { launching = null; });
  return launching;
}

function releaseBrowser() {
  if (live > 0 || idleTimer) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    const s = shared; shared = null;
    if (!s) return;
    s.browser.close().catch(() => { /* noop */ });
    fs.rm(s.profileDir, { recursive: true, force: true }, () => { /* best-effort */ });
  }, IDLE_CLOSE_MS);
  if (idleTimer.unref) idleTimer.unref();   // never hold the process open
}

// Admission control: at most MAX_TABS searches in flight. Replaces the old
// one-at-a-time queue — same protection against a Chrome stampede, ~3x the
// throughput.
const waiters = [];
async function acquireSlot() {
  if (live < MAX_TABS) { live++; return; }
  await new Promise((resolve) => waiters.push(resolve));
  live++;
}
function releaseSlot() {
  live--;
  const next = waiters.shift();
  if (next) next(); else releaseBrowser();
}

function buildSearchUrl(category, query, page = 1) {
  const segment = SEGMENTS[category] || "photos";
  const q = encodeURIComponent(String(query).trim().replace(/\s+/g, "-"));
  const base = `https://pixabay.com/${segment}/search/${q}/`;
  return page > 1 ? `${base}?p=${page}` : base;
}

// KEEP THE WORDS. A SCRAPED CANDIDATE WITH NO TEXT CANNOT BE RANKED.
//
// This provider used to push { url, license, sourceUrl, width: null, height: null }
// and drop the alt text it had already read. Downstream that is fatal: util's
// scoreCandidate tokenizes [tags, title, alt] -> [] -> the "no keywords" constant
// for EVERY candidate, and the resolution term is a constant too when width is
// null, so rankCandidates returned the scraper's arrival order unchanged. With
// the API key rejected this path serves every image in the film, which is the
// mechanical reason a scene about pricing ships a photo of a beach.
//
// Three signals are on the page and all three are now carried through:
//
// 1. The card link is Pixabay's own tag list — measured on a live search,
//    /photos/job-office-team-business-internet-5382501/ is the same vocabulary
//    the API returns in `tags`. This is the strongest relevance signal we get.
function tagsFromPath(href) {
  const m = /\/(?:photos|vectors|illustrations|images)\/([a-z0-9-]+?)(?:-\d+)?\/?$/i.exec(String(href || ""));
  return m ? m[1].replace(/-/g, " ") : "";
}

// 2. alt/title, minus Pixabay's boilerplate. Measured: alt is always
//    "Free <Subject> photo and picture" and title "Download free HD stock image
//    of <Subject>". Left intact, those wrapper words match query terms like
//    "photo"/"image" and hand every candidate the same fake relevance.
const CARD_BOILERPLATE = /\b(free|download|hd|stock|photo|photos|picture|pictures|image|images|illustration|illustrations|and|of)\b/gi;
function cardText(s) {
  return String(s || "").replace(CARD_BOILERPLATE, " ").replace(/\s+/g, " ").trim();
}

// 3. Real pixel size. naturalWidth/Height are the decoded dims of the rendition
//    the page actually loaded, and the CDN's _NNN suffix states the long edge —
//    so the _1280 rendition we prefer is that same picture at 1280, and a hit
//    that reports its full-size dims rescales to whatever rendition we push.
function longEdgeFromUrl(u) {
  const m = /_(\d{3,4})\.\w+$/.exec(String(u || ""));
  return m ? Number(m[1]) : 0;
}
function scaleTo(longEdge, width, height) {
  const src = Math.max(Number(width) || 0, Number(height) || 0);
  if (!src || !longEdge) return { width: Number(width) || null, height: Number(height) || null };
  const f = longEdge / src;
  return { width: Math.round(width * f), height: Math.round(height * f) };
}

function absoluteUrl(href) {
  try { return href ? new URL(href, "https://pixabay.com").toString() : ""; }
  catch { return ""; }
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

async function search(args) {
  if (args && args.type !== "image" && args.type !== "vector") return [];
  if (!findChrome()) return [];
  await acquireSlot();
  try { return await doSearch(args); }
  finally { releaseSlot(); }
}

async function doSearch({ query, type, limit = 5 }) {
  const chrome = findChrome();
  const browser = await getBrowser(chrome);

  let page = null;
  try {
    page = await browser.newPage();
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
    // Carry the card's link (its tag slug), alt/title and decoded size out with
    // the URL — see the three signals above.
    const domItems = await page.evaluate(() => {
      return [...document.querySelectorAll("img[src*='cdn.pixabay.com']")]
        .map((img) => {
          const a = img.closest("a");
          return {
            previewURL: img.src,
            alt: img.alt || "",
            title: img.getAttribute("title") || "",
            href: (a && a.getAttribute("href")) || "",
            natWidth: img.naturalWidth || 0,
            natHeight: img.naturalHeight || 0,
          };
        })
        .filter((i) => /_\d+\.(jpe?g|png|webp)/.test(i.previewURL));
    });

    const candidates = [];
    const seen = new Set();
    const push = (url, meta = {}) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      const dims = scaleTo(longEdgeFromUrl(url), meta.width, meta.height);
      candidates.push({
        url, license: "Pixabay Content License", sourceUrl: meta.sourceUrl || url,
        tags: meta.tags || "", title: cardText(meta.title), alt: cardText(meta.alt),
        width: dims.width, height: dims.height,
      });
    };

    for (const h of jsonHits) {
      const preview = h.previewURL || h.webformatURL || h.thumbnailUrl || h.thumbnail;
      if (typeof preview === "string" && preview.includes("cdn.pixabay.com")) {
        const meta = {
          sourceUrl: h.pageURL,
          tags: [Array.isArray(h.tags) ? h.tags.join(" ") : h.tags, tagsFromPath(h.pageURL)].filter(Boolean).join(" "),
          title: h.title || h.name || "", alt: h.alt || "",
          width: Number(h.imageWidth || h.webformatWidth || h.previewWidth) || 0,
          height: Number(h.imageHeight || h.webformatHeight || h.previewHeight) || 0,
        };
        // Prefer the larger rendition when the CDN has it.
        push(preview.replace(/_\d+(\.\w+)$/, "_1280$1"), meta);
        push(preview, meta);
      }
    }
    for (const d of domItems) {
      const meta = {
        sourceUrl: absoluteUrl(d.href),
        tags: tagsFromPath(d.href), title: d.title, alt: d.alt,
        width: d.natWidth, height: d.natHeight,
      };
      push(d.previewURL.replace(/_\d+(\.\w+)$/, "_1280$1"), meta);
      push(d.previewURL, meta);
    }

    // Rank BEFORE the truncation, or the truncation undoes the ranking: the
    // caller ranks too, but it only ever sees the first `limit * 2` URLs we hand
    // it, and a search page carries ~50 cards. Scored, not rankCandidates —
    // rankCandidates drops sub-MIN_LONG_EDGE candidates, and the _640 preview we
    // push beside each _1280 is the fallback for when the CDN has no _1280.
    const ranked = candidates
      .map((c) => ({ c, score: scoreCandidate(query, c).score }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);

    console.log(`[pixabay_scrape] "${query}" -> ${ranked.length} candidate URL(s); best "${(ranked[0] && ranked[0].tags) || "?"}"`);
    return ranked.slice(0, limit * 2);
  } finally {
    // Close the TAB, keep the browser warm for the next query.
    if (page) await page.close().catch(() => { /* noop */ });
  }
}

module.exports = { name: "pixabay_scrape", types: ["image", "vector"], available: () => !!findChrome(), search };
