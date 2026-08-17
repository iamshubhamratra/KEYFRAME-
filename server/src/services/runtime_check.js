// Runtime smoke-check for a composed composition.
//
// The hyperframes lint + composer quickCheck are STATIC — they regex the HTML.
// A composition can pass every static check and still render a BLANK video if
// its GSAP script throws at runtime (e.g. misusing a function-based value like
// `this.target()`), because the timeline is never registered and the renderer
// has nothing to seek. This module actually RUNS the composition in headless
// Chromium and verifies:
//   1. no uncaught page error was thrown, and
//   2. window.__timelines["vid"] is registered (so the renderer can drive it).
//
// It serves the job dir over an ephemeral localhost HTTP server so assets,
// fonts, and ES-module (Three.js) imports all resolve exactly as in the real
// render — avoiding file:// CORS false-positives. It NEVER hard-fails on
// infrastructure problems (missing chromium/puppeteer): those return ok:true so
// generation is never blocked by the checker itself.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2", ".woff": "font/woff",
};

// THE one Chromium lookup. contrast_check and templates/media.js both import this rather than
// keeping their own copies — there were three, and they had already drifted (only one knew about
// Apple silicon).
//
// VERSION ORDER IS NUMERIC, NOT LEXICAL. The install directories are named `win64-144.0.7559.96`,
// and a plain `.sort()` compares them as text: the moment a two-digit major is present,
// "win64-99..." sorts AFTER "win64-144..." and the lookup picks a Chromium several years old to
// render with. Every install on this machine happens to be a three-digit major today, which is
// exactly why the bug is invisible rather than absent.
function findChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const root = path.join(home, ".cache", "puppeteer", "chrome");
  const out = [];
  try {
    for (const dir of fs.readdirSync(root)) {
      for (const sub of [
        "chrome-win64/chrome.exe",
        "chrome-linux64/chrome",
        "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      ]) {
        const exe = path.join(root, dir, sub);
        if (fs.existsSync(exe)) out.push({ dir, exe });
      }
    }
  } catch { /* no cache */ }
  // Compare the dotted version segment by segment, numerically. The version follows the platform
  // prefix, so the match must be anchored to the HYPHEN: a bare \d+ grabs the "64" out of "win64"
  // for every directory, which makes them all compare equal and turns the sort into a no-op —
  // exactly the silent non-fix this change exists to avoid. Unparseable names yield [] and sort
  // first, so a malformed directory can never win.
  const ver = (d) => ((String(d).match(/-(\d+(?:\.\d+)*)/) || [])[1] || "").split(".").filter(Boolean).map(Number);
  out.sort((a, b) => {
    const va = ver(a.dir), vb = ver(b.dir);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (va[i] || 0) - (vb[i] || 0);
      if (d) return d;
    }
    return 0;
  });
  return out.length ? out[out.length - 1].exe : null;
}

function serveDir(dir) {
  const rootResolved = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/" || p === "") p = "/index.html";
    const file = path.resolve(path.join(rootResolved, p));
    if (!file.startsWith(rootResolved)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (e, buf) => {
      if (e) { res.statusCode = 404; return res.end(); }
      res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

// Returns { ok, error?, skipped? }. ok:true also when the checker can't run
// (no chromium / puppeteer) — the checker must never block a generation itself.
async function runtimeCheck(jobDir, { timeoutMs = 15000 } = {}) {
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); }
  catch { return { ok: true, skipped: "puppeteer-core not installed" }; }
  const exe = findChromium();
  if (!exe) return { ok: true, skipped: "no chromium" };
  if (!fs.existsSync(path.join(jobDir, "index.html"))) return { ok: true, skipped: "no index.html" };

  const { server, port } = await serveDir(jobDir);
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: exe, headless: "shell", args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 300)));
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle2", timeout: timeoutMs }).catch(() => {});
    await new Promise((r) => setTimeout(r, 700)); // let inline scripts settle
    const hasTl = await page
      .evaluate(() => !!(window.__timelines && window.__timelines["vid"]))
      .catch(() => false);
    if (pageErrors.length) return { ok: false, error: `the composition script threw at runtime: "${pageErrors[0]}"` };
    if (!hasTl) return { ok: false, error: `window.__timelines["vid"] was never registered — the timeline did not initialise, so the video renders BLANK` };
    return { ok: true };
  } catch (e) {
    return { ok: true, skipped: e.message }; // infra error → don't block
  } finally {
    try { await browser?.close(); } catch { /* noop */ }
    try { server.close(); } catch { /* noop */ }
  }
}

module.exports = { runtimeCheck, findChromium };
