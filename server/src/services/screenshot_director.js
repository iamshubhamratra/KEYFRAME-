// Screenshot Director agent — topic-matched INTERNAL-page captures.
//
// The ingest screenshots only ever show the LANDING page (hero + two scroll
// crops), so a scene narrating pricing showed a stock vector instead of the
// actual pricing page. This agent closes that gap:
//
//   1. DISCOVER  the site's internal pages — the link map collected at ingest
//                (job.website_pages), else a plain-fetch anchor scrape of the
//                homepage (regenerates of older jobs have no link map).
//   1b. RESCUE   an auth-walled app domain (claude.ai) has no capturable
//                pages at all — ask the LLM for the product's official PUBLIC
//                marketing site (claude.com), verify it live (200, no login
//                form, brand present), and shoot THERE instead.
//   2. MATCH     scenes -> pages with one small LLM call: "this scene talks
//                about pricing, the site has /pricing — capture it".
//   3. PREFLIGHT each pick with a cheap fetch so we never spend a PeekShot
//                capture on a 404, a login wall, or a redirect-to-home.
//   4. CAPTURE   the survivors in parallel on PeekShot (managed retina
//                browser, ads blocked, our consent killer injected).
//
// Returns pinned first-class assets (source:"website", sceneId set) — the
// same trusted shape as the landing-page pins, so every downstream stage
// (creative director, scene-kit Pass 0, blueprint plates, 3D composers)
// treats them as real product shots automatically.
//
// FAIL-SOFT by design: no URL, no PeekShot key, thin link map, LLM failure,
// every capture timing out — all return [] and the callers keep the landing
// screenshots. This agent must never make a video worse.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");
const peekshot = require("./peekshot");
const { extractFirstJsonObject } = require("./json_lenient");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

// Paths that are never worth a product shot (auth, legal, commerce plumbing,
// files, feeds). Applied to discovery AND to the LLM's picks (belt+braces).
const DENY_PATH = /(^|\/)(login|log-?in|sign-?in|sign-?up|signup|register|logout|auth|sso|account|profile|settings|cart|checkout|privacy|terms|legal|cookies?|gdpr|imprint|impressum|careers?|jobs|press|sitemap|search|rss|feed|cdn-cgi)(\/|$)|\.(pdf|zip|png|jpe?g|svg|webp|gif|mp4|xml|json|css|js)$/i;

// Well-known marketing paths, tried only when discovery finds a thin link map
// (JS-rendered navs are invisible to a plain fetch). Guessed paths must
// preflight to a real 200 page before they may be captured.
const COMMON_PATHS = [
  ["/pricing", "pricing"], ["/features", "features"], ["/product", "product"],
  ["/about", "about"], ["/customers", "customers"], ["/templates", "templates"],
  ["/integrations", "integrations"], ["/docs", "documentation"], ["/blog", "blog"],
];

const norm = (u) => { try { const x = new URL(u); return x.origin + (x.pathname.replace(/\/+$/, "") || "/"); } catch { return null; } };

// ---------- 1. DISCOVER ----------

// Plain-fetch anchor scrape — the fallback link map for jobs whose ingest
// predates link collection. No Chrome: just HTML + a tolerant regex.
async function scrapeLinks(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.text()).slice(0, 900_000);
  const base = new URL(res.url || url);
  const seen = new Set();
  const out = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 60) {
    let u; try { u = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname !== base.hostname) continue;
    const p = u.pathname.replace(/\/+$/, "") || "/";
    if (p === (base.pathname.replace(/\/+$/, "") || "/")) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const text = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    out.push({ url: u.origin + p, text });
  }
  return out;
}

async function discoverPages({ job, siteUrl }) {
  let pages = Array.isArray(job.website_pages) ? job.website_pages.slice() : [];
  if (!pages.length) {
    try { pages = await scrapeLinks(siteUrl); } catch (e) {
      console.warn(`[shots] link discovery failed (${String(e.message).slice(0, 120)})`);
    }
  }
  pages = pages
    .map((p) => ({ url: norm(p.url), text: String(p.text || "") }))
    .filter((p) => p.url && !DENY_PATH.test(new URL(p.url).pathname));
  // Thin map (JS-only nav, auth-walled homepage) -> offer well-known paths as
  // GUESSES. They only survive if preflight later confirms a real page.
  if (pages.length < 5) {
    let origin; try { origin = new URL(siteUrl).origin; } catch { return pages; }
    const have = new Set(pages.map((p) => new URL(p.url).pathname.toLowerCase()));
    for (const [p, label] of COMMON_PATHS) {
      if (!have.has(p)) pages.push({ url: origin + p, text: label, guessed: true });
    }
  }
  return pages.slice(0, 30);
}

// ---------- 1b. AUTH-WALL RESCUE ----------

// App domains that ARE the product (claude.ai, app.figma.com) greet a crawler
// with a sign-in form — zero capturable pages. But the product almost always
// has a PUBLIC marketing site (claude.com, figma.com). One small LLM call
// names it; we TRUST NOTHING it says until the candidate fetches as a real,
// login-free page that mentions the brand.
const ALT_SYSTEM = `You know the official web presence of software products. Given a product URL that is behind a sign-in wall, name the product's official PUBLIC marketing/company website(s) — sites owned by the SAME company where the product is presented to the public (e.g. claude.ai -> claude.com and anthropic.com).

Order matters: put the PRODUCT's own marketing site first (it has the pricing/features pages a promo film needs); the parent company's corporate site only after it. Reply ONLY JSON: {"domains":["https://...", ...]} — up to 3, best first, [] if unsure. Never guess third-party sites (reviews, wikis, app stores).`;

// Second-level label of the hostname = the brand token the alternate site must
// actually mention ("claude" from claude.ai, "figma" from app.figma.com).
function brandToken(siteUrl) {
  try {
    const parts = new URL(siteUrl).hostname.split(".");
    return (parts[parts.length - 2] || parts[0] || "").toLowerCase();
  } catch { return ""; }
}

async function findAlternateSite({ siteUrl, topic, tracker, signal }) {
  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: ALT_SYSTEM,
    user: `Sign-in-walled product URL: ${siteUrl}${topic ? `\nThe film about it is on: ${topic}` : ""}`,
    jsonMode: true, temperature: 0.1, stage: "screenshot_director", signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "screenshot_director", costUsd: costUsd });
  let parsed;
  try { parsed = extractFirstJsonObject(text) || {}; } catch { parsed = {}; }
  const brand = brandToken(siteUrl);
  const origOrigin = (() => { try { return new URL(siteUrl).origin; } catch { return null; } })();
  for (const d of (Array.isArray(parsed.domains) ? parsed.domains : []).slice(0, 3)) {
    let origin; try { origin = new URL(/^https?:\/\//i.test(d) ? d : `https://${d}`).origin; } catch { continue; }
    if (origin === origOrigin) continue;
    // Verify: real 200 HTML, no login form, and the brand is actually on it.
    try {
      const res = await fetch(origin, {
        redirect: "follow",
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 300_000);
      if (/type=["']?password/i.test(html)) continue;
      if (brand && !new RegExp(brand, "i").test(html)) continue;
      console.log(`[shots] auth-wall rescue: ${new URL(siteUrl).hostname} -> ${origin} (verified live, brand "${brand}" present)`);
      return origin;
    } catch { continue; }
  }
  return null;
}

// Resolve where to shoot: the given site, or — when it's a login wall with no
// real internal pages — its verified public marketing site. `rescued` means the
// film has NO landing screenshots at all, so the homepage becomes fair game.
async function resolveSite({ job, siteUrl, topic, tracker, signal }) {
  let pages = await discoverPages({ job, siteUrl });
  const real = pages.filter((p) => !p.guessed);
  if (real.length && !job.website_auth_wall) return { siteUrl, pages, rescued: false };
  const alt = await findAlternateSite({ siteUrl, topic, tracker, signal }).catch(() => null);
  if (!alt) return { siteUrl, pages, rescued: false };
  const altPages = await discoverPages({ job: { ...job, website_pages: [] }, siteUrl: alt });
  if (!altPages.length) return { siteUrl, pages, rescued: false };
  return { siteUrl: alt, pages: altPages, rescued: true };
}

// ---------- 2. MATCH (one small LLM call) ----------

const SYSTEM = `You are the Screenshot Director of an automated video studio. A promo film about a product has a script; the product's website has internal pages. Decide which scenes should show a REAL screenshot of a specific internal page.

Match on TOPIC: a scene about cost/plans -> the pricing page; a scene about capabilities -> the features/product page; social proof -> customers/case studies; setup or how-it-works -> docs/integrations. Only match when the page clearly holds what the scene talks about — a weak or decorative match is worse than none.

Hard rules:
- Pick AS MANY well-matched pairs as the script supports, up to 6. A film that SHOWS the product on six real pages is far more convincing than one that shows it twice — but a weak match is still worse than none, so do not force a pairing just to reach six. Zero picks is a valid answer.
- "url" MUST be copied verbatim from the CANDIDATE PAGES list. "sceneId" MUST be one of the scene ids.
- Never pick login/signup/legal pages. Never pick the homepage (its screenshots are already captured).
- At most one page per scene and one scene per page.

Reply with ONLY JSON: {"picks":[{"sceneId":<id>,"url":"...","label":"<2-3 word page name, e.g. pricing page>"}]}`;

function scenesDigest(script) {
  return (script.scenes || []).map((s) => {
    const bits = [
      `id=${JSON.stringify(s.id)} purpose=${s.purpose || "?"}`,
      s.onScreenText && s.onScreenText.length ? `text: ${s.onScreenText.join(" / ").slice(0, 120)}` : "",
      s.voiceover ? `vo: ${String(s.voiceover).slice(0, 160)}` : "",
      s.visualDirection ? `visual: ${String(s.visualDirection).slice(0, 100)}` : "",
    ].filter(Boolean);
    return `- ${bits.join(" | ")}`;
  }).join("\n");
}

async function matchScenesToPages({ script, pages, topic, tracker, signal }) {
  const pageList = pages.map((p) => `- ${p.url}${p.text ? ` — "${p.text}"` : ""}${p.guessed ? " (unverified guess)" : ""}`).join("\n");
  const user = `FILM TOPIC: ${topic || "(unknown)"}

SCENES:
${scenesDigest(script)}

CANDIDATE PAGES:
${pageList}`;
  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: SYSTEM, user, jsonMode: true, temperature: 0.2, stage: "screenshot_director", signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "screenshot_director", costUsd: costUsd });
  let parsed;
  try { parsed = extractFirstJsonObject(text) || {}; } catch { parsed = {}; } // garbage reply -> zero picks
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const sceneIds = new Set((script.scenes || []).map((s) => String(s.id)));
  const seenScene = new Set(), seenUrl = new Set();
  const picks = [];
  for (const raw of Array.isArray(parsed.picks) ? parsed.picks : []) {
    const url = norm(raw && raw.url);
    const sid = raw && raw.sceneId != null ? String(raw.sceneId) : null;
    if (!url || !byUrl.has(url) || !sid || !sceneIds.has(sid)) continue;      // hallucinated url/scene
    if (seenScene.has(sid) || seenUrl.has(url)) continue;
    if (DENY_PATH.test(new URL(url).pathname)) continue;
    seenScene.add(sid); seenUrl.add(url);
    picks.push({ sceneId: sid, url, label: String(raw.label || "page").slice(0, 40), guessed: !!byUrl.get(url).guessed });
    if (picks.length >= 6) break;
  }
  return picks;
}

// ---------- 3. PREFLIGHT ----------

// Cheap sanity fetch before spending a PeekShot capture. Fail-open for real
// (discovered) links when the fetch itself is blocked — PeekShot's managed
// browser often gets through bot walls a bare fetch can't. Guessed paths are
// held to a stricter standard: no confirmed 200, no capture.
async function preflight(url, { guessed }) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const finalU = new URL(res.url || url);
    const wanted = new URL(url);
    const fp = finalU.pathname.replace(/\/+$/, "") || "/";
    if (fp === "/" && (wanted.pathname.replace(/\/+$/, "") || "/") !== "/") return { ok: false, why: "redirects to homepage" };
    if (DENY_PATH.test(fp)) return { ok: false, why: "redirects to auth/legal" };
    const html = (await res.text()).slice(0, 120_000);
    if (/type=["']?password/i.test(html)) return { ok: false, why: "login form" };
    return { ok: true };
  } catch (e) {
    return guessed
      ? { ok: false, why: `unverifiable guess (${String(e.message).slice(0, 60)})` }
      : { ok: true, soft: true }; // bot-blocked fetch — let PeekShot's real browser try
  }
}

// ---------- 4. CAPTURE ----------

const slug = (s) => String(s || "page").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "page";

// Main entry. Returns pinned website-screenshot assets (possibly []) — never throws.
async function captureTopicShots({ job, script, jobDir, topic, tracker, signal }) {
  try {
    const siteUrl = job.intent && job.intent.websiteUrl;
    if (!siteUrl || !script || !Array.isArray(script.scenes) || !script.scenes.length) return [];
    if (!peekshot.enabled()) { console.log("[shots] PeekShot key missing — topic screenshots skipped"); return []; }

    const film = topic || job.website_title || "";
    const { siteUrl: activeSite, pages, rescued } = await resolveSite({ job, siteUrl, topic: film, tracker, signal });
    if (!pages.length) { console.log("[shots] no internal pages discovered — topic screenshots skipped"); return []; }

    const picks = await matchScenesToPages({ script, pages, topic: film, tracker, signal });

    // Rescued films have ZERO landing screenshots (the app domain was a login
    // wall), so the marketing homepage itself is worth a capture — pin it to
    // the first showcase scene no topic shot claimed.
    if (rescued && picks.length < 3 && !(job.website_screenshots || []).length) {
      const claimed = new Set(picks.map((p) => p.sceneId));
      const home = script.scenes.find((sc) => ["feature", "proof", "how", "context"].includes(String(sc.purpose || "")) && !claimed.has(String(sc.id)))
        || script.scenes.slice(1, -1).find((sc) => !claimed.has(String(sc.id)));
      if (home) picks.unshift({ sceneId: String(home.id), url: norm(activeSite + "/"), label: "homepage", guessed: false });
    }
    if (!picks.length) { console.log(`[shots] director matched 0 of ${pages.length} page(s) to scenes`); return []; }
    console.log(`[shots] director picked ${picks.map((p) => `${new URL(p.url).pathname}->scene ${p.sceneId}`).join(", ")}${rescued ? ` (via marketing site ${new URL(activeSite).hostname})` : ""}`);

    const flights = await Promise.all(picks.map((p) => preflight(p.url, p)));
    const live = picks.filter((p, i) => {
      if (!flights[i].ok) console.warn(`[shots] skip ${new URL(p.url).pathname}: ${flights[i].why}`);
      return flights[i].ok;
    });
    if (!live.length) return [];

    fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
    const sceneById = new Map(script.scenes.map((s) => [String(s.id), s]));
    const title = job.website_title || "the product";
    const settled = await Promise.allSettled(live.map((p, i) => {
      const relPath = `assets/images/page_${i}_${slug(p.label)}.png`;
      // A pick destined for a `phone` media slot must be shot at a MOBILE
      // viewport — the site then serves its own mobile breakpoint, so the
      // capture is genuinely portrait and fits a device bezel uncropped.
      const vp = peekshot.VIEWPORTS[p.viewport === "phone" ? "phone" : "desktop"];
      return peekshot.capture({
        url: p.url, outPath: path.join(jobDir, relPath),
        width: vp.width, height: vp.height, retina: true, delay: 3, timeoutMs: 75_000, signal,
      }).then((cap) => {
        const scene = sceneById.get(p.sceneId);
        return {
          path: relPath, type: "image",
          sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
          style: "inset",
          // Real probed pixel dims. Without these every shape gate downstream
          // (isPortraitAsset, scoreAsset's bezel-fit penalty, deviceKind) sees
          // ratio 0 and silently treats the shot as shapeless.
          width: cap.width || 0, height: cap.height || 0, ratio: cap.ratio || 0,
          alt: `REAL website screenshot of ${title} — the ${p.label} (matches this scene's topic) — present in a styled browser frame with hero treatment`,
          license: "owner content", sourceUrl: p.url, source: "website", fromCache: false,
        };
      });
    }));
    const shots = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") shots.push(r.value);
      else console.warn(`[shots] capture failed ${new URL(live[i].url).pathname}: ${String(r.reason && r.reason.message || r.reason).slice(0, 140)}`);
    });
    if (shots.length) console.log(`[shots] captured ${shots.length} topic page shot(s): ${shots.map((s) => s.path).join(", ")}`);
    return shots;
  } catch (e) {
    console.warn(`[shots] screenshot director failed soft: ${String(e && e.message || e).slice(0, 160)}`);
    return [];
  }
}

// Merge topic shots with the landing-page pins: a scene claimed by a topic
// shot drops its landing pin (the specific page beats the homepage), and the
// combined screenshot count is capped so films don't become slideshows.
// Merge the director's topic-matched page shots with the landing/section shots
// ingest already captured. The cap was 4 — with 3 topic shots that left room for
// exactly ONE of the three ingest captures, so a site the pipeline had already
// photographed six ways shipped a film showing it three times. A product film
// cannot have too many real screenshots of the product; the composer only ever
// places what its scenes have slots for, so a generous cap costs nothing.
function mergeShots(topicShots, landingPinned, cap = 9) {
  const claimed = new Set(topicShots.map((a) => String(a.sceneId)));
  const keep = landingPinned.filter((a) => !claimed.has(String(a.sceneId)));
  return [...topicShots, ...keep].slice(0, cap);
}

// resolveSite/matchScenesToPages/preflight/discoverPages are exported for the
// dry-run harness (server/scripts/shots-harness.js) — production code goes
// through captureTopicShots only.
module.exports = { captureTopicShots, mergeShots, discoverPages, resolveSite, matchScenesToPages, preflight };
