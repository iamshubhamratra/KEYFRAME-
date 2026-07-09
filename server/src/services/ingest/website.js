// Ingest worker 1b: website URL -> structured understanding.
//
// Drives a cached Chrome (the one HyperFrames' renderer already downloaded
// into ~/.cache/puppeteer) via puppeteer-core: captures title/meta/headings/
// body text, the OG image, a full-page screenshot, and dominant brand colors
// (screenshot -> ffmpeg rawvideo downscale -> saturation-weighted quantize —
// no native image deps needed).
//
// Output: { url, title, description, headings[], bodyText, brandColors[],
//           ogImage, screenshotPath }

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const config = require("../../config");

function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (config.ingest?.chromePath && fs.existsSync(config.ingest.chromePath)) {
    return config.ingest.chromePath;
  }
  const cacheDir = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
  try {
    const versions = fs.readdirSync(cacheDir)
      .filter((d) => d.startsWith("win64-") || d.startsWith("linux-") || d.startsWith("mac-"))
      .sort()
      .reverse();
    for (const v of versions) {
      for (const sub of ["chrome-win64/chrome.exe", "chrome-linux64/chrome", "chrome-mac-x64/chrome"]) {
        const p = path.join(cacheDir, v, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* no cache */ }
  // Common system installs as a last resort.
  for (const p of [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Downscale the screenshot with ffmpeg to a tiny raw RGB buffer, then pick
// dominant colors with a saturation-and-frequency-weighted quantize.
function dominantColors(screenshotPath) {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", screenshotPath,
      "-vf", "scale=48:48",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ]);
    const chunks = [];
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.on("error", () => resolve([]));
    ff.on("exit", (code) => {
      if (code !== 0) return resolve([]);
      const buf = Buffer.concat(chunks);
      const buckets = new Map(); // quantized color -> {count, satSum, r,g,b sums}
      for (let i = 0; i + 2 < buf.length; i += 3) {
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = (r + g + b) / 765;
        // Skip near-white/near-black/near-gray — they're page chrome, not brand.
        if (lum > 0.92 || lum < 0.08 || sat < 0.15) continue;
        const key = `${r >> 5}_${g >> 5}_${b >> 5}`;
        const e = buckets.get(key) || { count: 0, sat: 0, r: 0, g: 0, b: 0 };
        e.count++; e.sat += sat; e.r += r; e.g += g; e.b += b;
        buckets.set(key, e);
      }
      const ranked = [...buckets.values()]
        .map((e) => ({ score: e.count * (e.sat / e.count + 0.3), r: e.r / e.count, g: e.g / e.count, b: e.b / e.count }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((e) => "#" + [e.r, e.g, e.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase());
      resolve([...new Set(ranked)]);
    });
  });
}

// Dismiss cookie / consent banners so they don't get baked into the hero
// screenshot (the reported "sign-in page with a cookie popup" shot). Click the
// most common accept/reject control, then hide any leftover fixed overlay.
// Best-effort: any failure just leaves the page as-is.
async function dismissConsent(page) {
  try {
    await page.evaluate(() => {
      const rxAccept = /^(accept all|accept|allow all|allow|agree|i agree|got it|ok|okay)$/i;
      const rxReject = /^(reject all|reject|decline|only necessary|necessary only|dismiss|close)$/i;
      const clickable = [...document.querySelectorAll('button,[role="button"],a,input[type="button"],input[type="submit"]')];
      const byText = (rx) => clickable.find((el) => rx.test(((el.innerText || el.value || el.getAttribute("aria-label") || "")).trim()));
      const btn = byText(rxAccept) || byText(rxReject);
      if (btn) { try { btn.click(); } catch { /* noop */ } }
      // Hide leftover fixed/sticky consent overlays (OneTrust, generic cookie bars).
      const sel = '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i],[aria-label*="cookie" i],#onetrust-banner-sdk,.ot-sdk-container,.cookie-banner,.cookie-consent';
      document.querySelectorAll(sel).forEach((el) => {
        const st = getComputedStyle(el);
        if (st.position === "fixed" || st.position === "sticky") el.style.display = "none";
      });
    });
    await new Promise((r) => setTimeout(r, 450)); // let it animate out
  } catch { /* consent dismissal is best-effort */ }
}

async function understandWebsite({ url, workDir, timeoutMs = 60_000 }) {
  const chrome = findChrome();
  if (!chrome) throw new Error("no Chrome found for website ingest (set PUPPETEER_EXECUTABLE_PATH or config.ingest.chromePath)");
  fs.mkdirSync(workDir, { recursive: true });

  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1366,900"],
  });

  try {
    const page = await browser.newPage();
    // deviceScaleFactor:2 = retina capture (~2732x1800) so screenshots stay
    // crisp when scaled up inside a browser frame in a 1080p+ video.
    await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 2 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36");
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
    // Let lazy content/fonts settle briefly.
    await new Promise((r) => setTimeout(r, 1200));
    // Clear cookie/consent overlays before we read or screenshot anything.
    await dismissConsent(page);

    const data = await page.evaluate(() => {
      const meta = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.content ||
        document.querySelector(`meta[property="${name}"]`)?.content || null;
      const headings = [...document.querySelectorAll("h1, h2, h3")]
        .map((h) => h.textContent.replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 1 && t.length < 200)
        .slice(0, 25);
      const bodyText = (document.body?.innerText || "")
        .replace(/\n{3,}/g, "\n\n")
        .slice(0, 4000);
      // Auth-wall detection: many app domains (e.g. claude.ai) redirect to a
      // sign-in/login page, so the "hero" screenshot becomes a login form, not
      // the product. Flag it so we DON'T pin those shots as product visuals.
      const authWall = (() => {
        const t = (document.title || "").toLowerCase();
        const u = location.href.toLowerCase();
        const hasPw = !!document.querySelector('input[type="password"]');
        const oauth = /continue with (google|apple|github|microsoft|sso)|sign in with|log in with/i.test(bodyText);
        const titleHit = /\b(sign ?in|log ?in|login|sign ?up)\b/.test(t);
        const urlHit = /\/(login|sign-?in|signup|sign-?up|auth|account\/login|u\/login)/.test(u);
        const sparse = document.querySelectorAll("h1,h2,h3").length <= 2 && bodyText.length < 1200;
        return ((titleHit || urlHit) && (hasPw || oauth)) || (hasPw && oauth && sparse);
      })();
      return {
        title: document.title || null,
        description: meta("description") || meta("og:description"),
        ogImage: meta("og:image"),
        headings,
        bodyText,
        authWall,
      };
    });
    const isAuthWall = !!data.authWall;
    delete data.authWall;
    if (isAuthWall) console.warn(`[ingest] "${data.title}" looks like a sign-in / auth wall — NOT using its screenshots as product visuals`);

    // Capture the hero shot regardless — brand colors are still extracted from
    // it — but only OFFER screenshots as product assets when the page is a real
    // product/marketing page. On an auth wall the shots are a login form, so we
    // return none rather than showcase a sign-in page.
    const heroPath = path.join(workDir, "website.png");
    await page.screenshot({ path: heroPath, fullPage: false });

    // Multiple REAL screenshots — the hero plus two deeper sections. These
    // become first-class video assets (showcased in device frames), which is
    // far more credible than any stock image.
    const screenshotPaths = isAuthWall ? [] : [heroPath];
    if (!isAuthWall) {
      try {
        const pageH = await page.evaluate(() => Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight || 0));
        const viewH = 900;
        for (const [i, frac] of [[2, 0.35], [3, 0.7]]) {
          const y = Math.floor((pageH - viewH) * frac);
          if (y < viewH * 0.5) continue; // page too short for distinct sections
          await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
          await new Promise((r) => setTimeout(r, 900)); // lazy content settles
          const p = path.join(workDir, `website_section${i}.png`);
          await page.screenshot({ path: p, fullPage: false });
          screenshotPaths.push(p);
        }
      } catch (e) {
        console.warn(`[ingest] section screenshots failed: ${e.message}`);
      }
    }

    const brandColors = await dominantColors(heroPath).catch(() => []);
    const screenshotPath = isAuthWall ? null : heroPath;

    console.log(`[ingest] website understood: "${data.title}" — ${data.headings.length} headings, ${data.bodyText.length}ch body, ${screenshotPaths.length} usable screenshot(s)${isAuthWall ? " (auth wall — screenshots suppressed)" : ""}, colors=${brandColors.join(",")}`);
    return { url, ...data, isAuthWall, brandColors, screenshotPath, screenshotPaths };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { understandWebsite, findChrome };
