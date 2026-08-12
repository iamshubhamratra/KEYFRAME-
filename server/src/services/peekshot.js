// PeekShot screenshot API client — high-quality website captures for ingest.
//
// Why: the local puppeteer capture (ingest/website.js) depends on a cached
// Chrome and the host's fonts/GPU; PeekShot renders on managed infrastructure
// and returns a clean retina PNG (2732x1800 for a 1366x900@2x viewport), which
// is what we frame as the product hero inside videos. This client is a
// fail-soft ENHANCER: any error/timeout just means the caller keeps its local
// screenshot.
//
// API (docs.peekshot.com):
//   POST https://api.peekshot.com/api/v1/screenshots   (x-api-key header)
//     { project_id, url, width, height, file_type, retina, full_page, delay,
//       inject_js, block_ads, block_cookie_banner, ... }  (all values strings)
//     -> 201 { data: { requestId } }   (async queue)
//   GET  https://api.peekshot.com/api/v1/screenshots/{id}
//     -> { data: { status: "IN_QUEUE" | ... | "COMPLETE", screenshotUrl } }
//   GET  https://api.peekshot.com/api/v1/projects -> { data: { projects: [{id}] } }
//
// GOTCHA (verified live): PeekShot's own block_cookie_banner heuristic is
// unreliable — on stripe.com it CLICKED "manage settings" and captured the
// cookie-settings page; on anthropic.com it missed the banner entirely. So we
// keep it OFF and inject our own consent killer (the same click-accept +
// hide-fixed-overlays heuristic ingest/website.js uses locally) via inject_js,
// re-run on a timer so late-mounting banners are caught before the delayed
// capture fires.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { imageDimsFromBuffer } = require("./asset_sources/util");

const BASE = "https://api.peekshot.com/api/v1";

// The two shapes a film ever frames a capture in. A `phone` media slot mounts
// its image in a device bezel, so it needs a genuinely PORTRAIT capture — at
// 390px wide essentially every modern site serves its mobile breakpoint (layout
// keys off viewport width, not user-agent). Sites that UA-sniff return a
// squeezed desktop layout; screenshot_qa catches that as "broken-layout".
const VIEWPORTS = {
  desktop: { width: 1366, height: 900 },
  phone: { width: 390, height: 844 },
};

// PeekShot captures used to fire completely unthrottled — screenshot_director
// does Promise.allSettled over every surviving pick. That was tolerable at the
// old cap of 6; demand-driven capture can ask for 12+, and each one holds a
// poll loop open for up to 90s. Cap the in-flight count so a wide film doesn't
// stampede the API (and so a slow queue can't pin a dozen sockets at once).
const MAX_INFLIGHT = Math.max(1, Number(process.env.PEEKSHOT_CONCURRENCY) || 4);
let inFlight = 0;
const waiters = [];
function acquireSlot() {
  if (inFlight < MAX_INFLIGHT) { inFlight++; return Promise.resolve(); }
  return new Promise((resolve) => waiters.push(resolve));
}
function releaseSlot() {
  const next = waiters.shift();
  if (next) next();            // hand the slot straight over; inFlight unchanged
  else inFlight = Math.max(0, inFlight - 1);
}

function settings() {
  const ps = (config.ingest && config.ingest.peekshot) || {};
  return { apiKey: ps.apiKey || "", projectId: ps.projectId || null };
}

function enabled() { return !!settings().apiKey; }

// Same consent heuristic as ingest/website.js dismissConsent(), inlined for
// PeekShot's inject_js: click an exact-text accept/reject control, then hide
// leftover fixed/sticky cookie/consent overlays. Re-runs a few times because
// consent UIs mount late; the capture itself is delayed past the last pass.
const CONSENT_KILLER_JS = `(function(){function kill(){try{var ra=/^(accept all|accept|allow all|allow|agree|i agree|got it|ok|okay|accept all cookies)$/i,rr=/^(reject all|reject|decline|only necessary|necessary only|dismiss|close|reject all cookies)$/i,cs=[].slice.call(document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]'));function by(rx){for(var i=0;i<cs.length;i++){var t=((cs[i].innerText||cs[i].value||cs[i].getAttribute("aria-label")||"")).trim();if(rx.test(t))return cs[i];}return null;}var b=by(ra)||by(rr);if(b){try{b.click();}catch(e){}}var sel='[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i],[aria-label*="cookie" i],#onetrust-banner-sdk,.ot-sdk-container,.cookie-banner,.cookie-consent';[].slice.call(document.querySelectorAll(sel)).forEach(function(el){try{var st=getComputedStyle(el);if(st.position==="fixed"||st.position==="sticky")el.style.display="none";}catch(e){}});}catch(e){}}kill();setTimeout(kill,600);setTimeout(kill,1500);setTimeout(kill,2600);})();`;

async function api(method, pathname, body) {
  const { apiKey } = settings();
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { "x-api-key": apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === "error") {
    throw new Error(`peekshot ${method} ${pathname} -> ${res.status}: ${json.message || json.data?.error || "unknown"}`);
  }
  return json;
}

// project_id is required by the POST but most accounts have exactly one
// ("Default") — resolve and cache it so config only needs the key.
let cachedProjectId = null;
async function resolveProjectId() {
  const { projectId } = settings();
  if (projectId) return String(projectId);
  if (cachedProjectId) return cachedProjectId;
  const json = await api("GET", "/projects");
  const first = json.data?.projects?.[0];
  if (!first?.id) throw new Error("peekshot: no projects on this account");
  cachedProjectId = String(first.id);
  return cachedProjectId;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Capture one screenshot and write it to outPath. Throttled to MAX_INFLIGHT.
// Returns { outPath, requestId, bytes, width, height, ratio } with dims PROBED
// from the returned bytes — never assumed from the request, because `retina`
// doubles them and `fullPage` replaces the height entirely. Throws on
// failure/timeout — callers treat this as "keep the local shot".
async function capture(opts = {}) {
  await acquireSlot();
  try { return await captureOne(opts); }
  finally { releaseSlot(); }
}

async function captureOne({
  url,
  outPath,
  width = 1366,
  height = 900,
  retina = true,
  fullPage = false,
  fileType = "png",
  delay = 3,               // seconds before capture — lets the consent killer run
  // Measured completion latency on a live account (2026-08-03): median ~47s,
  // max 112s, and a queue backlog can push past that. The old 90s default sat
  // inside the normal spread, so ordinary captures failed as "timeouts".
  timeoutMs = 180_000,
  signal = null,
} = {}) {
  if (!enabled()) throw new Error("peekshot: no apiKey configured");
  const projectId = await resolveProjectId();
  const submitted = await api("POST", "/screenshots", {
    project_id: projectId,
    url,
    width: String(width),
    height: String(height),
    file_type: fileType,
    retina: String(!!retina),
    full_page: String(!!fullPage),
    delay: String(delay),
    block_ads: "true",
    // OFF on purpose — see GOTCHA above; inject_js is our consent path.
    block_cookie_banner: "false",
    inject_js: CONSENT_KILLER_JS,
  });
  const requestId = submitted.data?.requestId;
  if (!requestId) throw new Error("peekshot: submit returned no requestId");

  const deadline = Date.now() + timeoutMs;
  let shotUrl = null;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("peekshot: aborted");
    const st = await api("GET", `/screenshots/${requestId}`);
    const s = String(st.data?.status || "").toUpperCase();
    if (s === "COMPLETE" || s === "COMPLETED" || s === "SUCCESS") { shotUrl = st.data?.screenshotUrl; break; }
    if (s === "FAILED" || s === "ERROR" || s === "CANCELLED") throw new Error(`peekshot: capture ${s}`);
    await sleep(2500);
  }
  if (!shotUrl) throw new Error(`peekshot: timed out after ${Math.round(timeoutMs / 1000)}s (request ${requestId})`);

  const img = await fetch(shotUrl, { signal });
  if (!img.ok) throw new Error(`peekshot: image download ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length < 1024) throw new Error("peekshot: image suspiciously small");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  // Real pixel dims, straight from the bytes we already hold. Every downstream
  // shape decision (phone-vs-desktop slot matching, bezel fit, crop focus) reads
  // asset.ratio; without this it is 0 and a capture can NEVER satisfy a portrait
  // slot, so a landscape shot gets crammed into a phone bezel instead.
  // Named apart from the `width`/`height` REQUEST params above — these are the
  // real dims of the returned bytes, which `retina` doubles and `fullPage`
  // replaces outright, so they must not shadow (or be confused with) the request.
  const dims = imageDimsFromBuffer(buf);
  const outWidth = (dims && dims.width) || 0;
  const outHeight = (dims && dims.height) || 0;
  return {
    outPath, requestId, bytes: buf.length,
    width: outWidth, height: outHeight,
    ratio: outHeight > 0 ? outWidth / outHeight : 0,
  };
}

module.exports = { enabled, capture, resolveProjectId, CONSENT_KILLER_JS, VIEWPORTS };
