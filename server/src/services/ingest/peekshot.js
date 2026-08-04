// PEEKSHOT — hosted screenshot capture, used as the RESCUE path for website ingest.
//
// WHY A SECOND CAPTURE PATH. `ingest/website.js` drives a local headless Chrome. When it
// works it produces far more than pixels — DOM text, headings, brand colours, computed
// typography, harvested brand assets, and the capture-time obstruction geometry the
// intake gate depends on. It is, and stays, the primary.
//
// But it has a documented history of failing SILENTLY and entirely: a missing/incompatible
// Chrome, the SSRF connection pin vs Node 20's autoSelectFamily, a poisoned harvest cache,
// `networkidle2` never settling on a busy marketing page. When it fails there are no
// screenshots at all, and the film quietly falls back to stock — the exact "I gave you my
// website and got none of my product" complaint the pipeline exists to avoid.
//
// PeekShot needs no local browser, and it natively suppresses the thing that ruins these
// captures: `block_cookie_banner` and `block_ads` default ON, with an optional popup
// heuristic. Consent-banner obstruction is the single most common screenshot defect in
// this codebase (it is why the Creative Director grew a reject band at all).
//
// WHAT IT CANNOT DO — and where that is handled:
//   • No DOM truth. It returns an image, so it cannot report `clean` / `obstructions` /
//     `maxCoveragePct`. Its records carry `clean: null` (UNKNOWN — not `true`, which would
//     falsely claim we verified it, and not `false`, which the intake gate hard-drops).
//     The deterministic blank/duplicate gates still run, and the Creative Director's vision
//     pass still inspects the pixels, so a banner it failed to block is still caught.
//   • No headings/section semantics, so `kind`/`heading` stay null and scene-aware pinning
//     degrades to round-robin.
//   • It captures a VIEWPORT, not a scroll position. `inject_js` CAN scroll the page
//     before capture (verified working against the live API), so deeper sections are
//     reachable — but each one is another credit and another queue wait, and a rescue
//     wants to be cheap and fast. Hero-only by default; `maxShots`/`mobileShot` widen it.
//
// LATENCY IS VARIABLE, and this drives the timeout. Measured on the live queue: a plain
// capture can return in ~15 s, but individual requests have sat IN_QUEUE past 100 s while
// LATER ones completed — so it is a shared queue with per-request variance, not FIFO.
// The ceiling is therefore generous and configurable; a rescue that gives up at 90 s
// would abandon captures that were about to succeed.
//
// ASYNC BY CONTRACT (verified against the live API):
//   POST /api/v1/screenshots        -> 201 { data: { requestId, creditRequired } }
//   GET  /api/v1/screenshots/{id}   -> { data: { status: "IN_QUEUE"|"COMPLETE", screenshotUrl } }
//   then download screenshotUrl (S3).
// Every capture costs credits, so this runs only when the primary produced nothing.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../../config");

const API_BASE = "https://api.peekshot.com/api/v1";
// The image is delivered from PeekShot's own bucket. Pinning the download host keeps a
// compromised/unexpected redirect from turning this into a request generator against
// arbitrary infrastructure — the same care ingest/website_assets applies to harvests.
const ALLOWED_IMAGE_HOSTS = /(^|\.)peekshot\.com$|(^|\.)amazonaws\.com$/i;

function cfg() {
  return config.peekshot || {};
}
function enabled() {
  return !!(cfg().enabled && cfg().apiKey);
}

function headers() {
  return { "x-api-key": cfg().apiKey, "Content-Type": "application/json" };
}

async function api(pathname, { method = "GET", body, timeoutMs = 20_000 } = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || text.slice(0, 200);
    const err = new Error(`peekshot ${method} ${pathname} -> HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// The API requires a project_id. Resolve it once per process: an explicit config value
// wins; otherwise take the account's first project (a fresh account has exactly one,
// "Default"). Cached because it never changes mid-run, and a failure here must not cost
// a capture attempt its error message.
let projectIdCache = null;
async function resolveProjectId() {
  if (cfg().projectId) return String(cfg().projectId);
  if (projectIdCache) return projectIdCache;
  const json = await api("/projects");
  const list = (json && json.data && json.data.projects) || [];
  if (!list.length) throw new Error("peekshot: the account has no project to capture into");
  projectIdCache = String(list[0].id);
  console.log(`[peekshot] using project ${projectIdCache} ("${list[0].name}")`);
  return projectIdCache;
}

// Terminal failure vocabulary is not documented; treat an explicit error message or an
// obviously-final status as fatal, and everything else as "still working" until the
// caller's deadline. Guessing wrong in this direction just costs one more poll — which is
// why PENDING and IN_QUEUE (both observed live, in that order) need no special case.
//
// NOTE ON WHAT THIS CANNOT JUDGE: a technically perfect capture of a broken page is still
// COMPLETE here. Observed live — a 1280x720 PNG of a site's "Sorry, an error occurred"
// screen. Nothing in the API's response distinguishes that from a good capture, so the
// judgement is left where it already exists: the Creative Director's vision pass flags
// `completeness: broken|empty` and REJECTS the shot, and the deterministic blank gate
// catches the near-empty ones. This provider must not pretend to a verdict it cannot form.
function classify(row) {
  const status = String((row && row.status) || "").toUpperCase();
  if (status === "COMPLETE" && row.screenshotUrl) return "done";
  if (row && row.errorMessage) return "failed";
  if (/FAIL|ERROR|CANCEL|REJECT/.test(status)) return "failed";
  return "pending";
}

async function downloadImage(url, outputPath, timeoutMs) {
  let host = "";
  try { host = new URL(url).hostname; } catch { throw new Error(`peekshot: malformed image url`); }
  if (!ALLOWED_IMAGE_HOSTS.test(host)) throw new Error(`peekshot: refusing to download from unexpected host "${host}"`);
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`peekshot: image download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`peekshot: image is implausibly small (${buf.length}B)`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  return { bytes: buf.length };
}

/**
 * captureOne({ url, outputPath, width, height, device, delaySec, signal })
 *   → { path, bytes, requestId, credits, ms } | throws
 *
 * One submit + poll + download cycle. Costs one credit.
 */
async function captureOne({ url, outputPath, width, height, device = null, delaySec, fullPage = false }) {
  const c = cfg();
  const t0 = Date.now();
  const project_id = await resolveProjectId();

  // Every option is sent as a STRING — the API's documented parameter type.
  const body = {
    project_id,
    url,
    width: String(width || c.width || 1280),
    height: String(height || c.height || 720),
    file_type: "png",
    full_page: fullPage ? "true" : "false",
    delay: String(delaySec != null ? delaySec : (c.delaySec != null ? c.delaySec : 3)),
    // The whole reason this provider is worth having.
    block_cookie_banner: "true",
    block_ads: "true",
    block_popups_by_heuristics: "true",
    disable_animations: "true",   // a frame caught mid-animation is a wasted capture
    // FORCE A REAL CAPTURE. The API caches by default (`fresh:false`), and the account
    // may be shared — an unrelated earlier request for the same URL can hand this one a
    // stale image. Observed live: a capture of notion.com returned that site's ERROR page
    // seconds after another request had captured the same URL. A rescue exists precisely
    // because the first attempt produced nothing usable; serving it a cached copy of
    // someone else's bad luck defeats the point.
    fresh: "true",
    ...(device ? { emulate_device: device } : {}),
  };

  const sub = await api("/screenshots", { method: "POST", body, timeoutMs: c.requestTimeoutMs || 25_000 });
  const requestId = sub && sub.data && sub.data.requestId;
  if (!requestId) throw new Error(`peekshot: no requestId in submit response`);
  const credits = (sub.data && sub.data.creditRequired) || 1;

  const deadline = Date.now() + (c.captureTimeoutMs || 90_000);
  const pollMs = c.pollMs || 3000;
  let row = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const poll = await api(`/screenshots/${requestId}`, { timeoutMs: 15_000 }).catch(() => null);
    row = (poll && poll.data) || null;
    const state = classify(row);
    if (state === "done") break;
    if (state === "failed") throw new Error(`peekshot: capture failed — ${(row && row.errorMessage) || row.status}`);
    row = null;
  }
  if (!row) throw new Error(`peekshot: capture ${requestId} did not complete within ${Math.round((c.captureTimeoutMs || 90_000) / 1000)}s`);

  const { bytes } = await downloadImage(row.screenshotUrl, outputPath, 30_000);
  return { path: outputPath, bytes, requestId, credits, ms: Date.now() - t0 };
}

/**
 * captureShots({ url, workDir, max, mobile })
 *   → capture RECORDS in the shape ingest/website.js emits, so
 *     screenshot_intake.filterScreenshots and every downstream consumer read them
 *     with zero new plumbing.
 *
 * Never throws: this is a rescue path, and a rescue that can fail the job is not a
 * rescue. Returns [] when disabled or unsuccessful.
 */
async function captureShots({ url, workDir, max = 1, mobile = null }) {
  if (!enabled()) return [];
  const c = cfg();
  const wantMobile = mobile != null ? mobile : c.mobileShot === true;
  const dir = path.join(workDir, "peekshot");

  const jobs = [{ device: null, kind: "hero", file: "ps_hero.png" }];
  // A phone-shaped capture is genuinely useful: the Visual Layout Director routes a
  // portrait screenshot into a phone mockup instead of a browser frame, so this becomes
  // a second, visually distinct shot rather than a duplicate of the hero.
  if (wantMobile && max > 1) jobs.push({ device: c.mobileDevice || "iPhone 15", kind: "mobile", file: "ps_mobile.png" });

  const out = [];
  for (const j of jobs.slice(0, Math.max(1, max))) {
    try {
      const res = await captureOne({
        url,
        outputPath: path.join(dir, j.file),
        device: j.device,
        width: j.device ? undefined : (c.width || 1280),
        height: j.device ? undefined : (c.height || 720),
      });
      out.push({
        path: res.path,
        // HONEST METADATA. A hosted capture has no DOM truth, so `clean` is UNKNOWN.
        // filterScreenshots hard-drops only `clean === false`; null flows through to the
        // deterministic blank/duplicate gates and the CD's vision QA, which is exactly
        // the right amount of trust for pixels nobody inspected at capture time.
        clean: null,
        kind: j.kind,
        heading: "",
        obstructions: [],
        maxCoveragePct: null,
        contentScore: null,
        source: "peekshot",
        requestId: res.requestId,
      });
      console.log(`[peekshot] captured ${j.kind} for ${url} (${Math.round(res.bytes / 1024)}KB, ${res.ms}ms, ${res.credits} credit)`);
    } catch (e) {
      console.warn(`[peekshot] ${j.kind} capture failed: ${String(e.message).slice(0, 160)}`);
    }
  }
  return out;
}

module.exports = { enabled, captureShots, captureOne, resolveProjectId, classify, __API_BASE: API_BASE };
// Test seam: the resolved project id is cached for the process lifetime (it cannot change
// mid-run), which makes "does it look the project up?" unobservable after the first call.
module.exports.__resetProjectCache = () => { projectIdCache = null; };
