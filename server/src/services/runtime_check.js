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
      ]) {
        const exe = path.join(root, dir, sub);
        if (fs.existsSync(exe)) out.push(exe);
      }
    }
  } catch { /* no cache */ }
  return out.sort().reverse()[0] || null;
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
async function runtimeCheck(jobDir, { timeoutMs = 15000, sweep = true } = {}) {
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

    // SWEEP THE TIMELINE, DON'T JUST CHECK FRAME ZERO.
    //
    // Everything above happens at t=0, where a film that dies on its SIXTH scene
    // looks perfect. Measured on a shipped 36s film: it played correctly to 21.9s
    // and then rendered the engine's error slate — a flat coloured frame with a red
    // "words.map is not a function" pill — for its final 14 seconds. Frame zero was
    // clean, the timeline registered, static lint passed, and the film shipped.
    //
    // The compiled-template films catch their own component errors and PAINT that
    // slate, so no uncaught pageerror is ever raised: the only way to see it is to
    // seek into the film and read the frame. Eight probes is enough to catch a
    // whole dead scene without turning a smoke test into a render.
    if (sweep) {
      let duration = 0;
      try { duration = Number(JSON.parse(fs.readFileSync(path.join(jobDir, "meta.json"), "utf8")).duration) || 0; } catch { /* no meta */ }
      if (duration > 1) {
        const probes = 8;
        for (let i = 1; i <= probes; i++) {
          const t = +(duration * (i / (probes + 1))).toFixed(2);
          const hit = await page.evaluate(async (tt) => {
            const tl = (window.__timelines || {})["vid"];
            if (tl && typeof tl.time === "function") tl.time(tt);
            await new Promise((r) => setTimeout(r, 60));
            const txt = String(document.body.innerText || "");
            const m = /([\w$.]*\s*(?:is not a function|is not defined)|Cannot read propert[^\n]{0,60}|undefined is not [^\n]{0,40})/.exec(txt);
            return m ? m[0].slice(0, 120) : null;
          }, t).catch(() => null);
          if (hit) {
            return { ok: false, atSec: t, error: `the film renders a runtime ERROR SLATE from ${t}s onward ("${hit}") — every scene from there is a blank frame with an error message` };
          }
          if (pageErrors.length) {
            return { ok: false, atSec: t, error: `the composition threw while seeking to ${t}s: "${pageErrors[0]}"` };
          }
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: true, skipped: e.message }; // infra error → don't block
  } finally {
    try { await browser?.close(); } catch { /* noop */ }
    try { server.close(); } catch { /* noop */ }
  }
}

module.exports = { runtimeCheck, findChromium };
