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
const peekshot = require("../peekshot");
const { imageDHashStats } = require("../asset_sources/util");

// Grayscale stdev below this reads as a flat/near-flat panel. Deliberately a
// little stricter than acquire()'s stock floor (5): a promo gradient carries
// slightly more variance than a solid fill, and both are useless in a card.
const SITE_IMG_MIN_STDEV = 12;

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

// PNG header probe (IHDR width/height) — no image deps needed.
function pngSize(p) {
  try {
    const b = Buffer.alloc(24);
    const fd = fs.openSync(p, "r");
    fs.readSync(fd, b, 0, 24, 0);
    fs.closeSync(fd);
    if (b.readUInt32BE(12) !== 0x49484452) return null; // "IHDR"
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } catch { return null; }
}

// Crop a window out of a (full-page) PNG with ffmpeg.
function cropPng(srcPath, outPath, x, y, w, h) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", srcPath, "-vf", `crop=${w}:${h}:${x}:${y}`, outPath,
    ]);
    ff.on("error", reject);
    ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg crop exited ${code}`))));
  });
}

// Download a remote image to a file (fail-soft). Caps size + verifies it's an
// image so we never save an HTML error page. Used to pull the site's OWN images
// into the film (its real UI/brand imagery beats any stock photo).
function downloadImage(url, outPath, referer, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch { return resolve(false); }
    if (!/^https?:$/.test(u.protocol)) return resolve(false);
    const mod = u.protocol === "https:" ? require("node:https") : require("node:http");
    const req = mod.get(u, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*;q=0.8", ...(referer ? { Referer: referer } : {}) },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode !== 200 || !/^image\//i.test(res.headers["content-type"] || "")) { res.resume(); return resolve(false); }
      const max = 10 * 1024 * 1024; let got = 0;
      const file = fs.createWriteStream(outPath);
      res.on("data", (d) => { got += d.length; if (got > max) { req.destroy(); file.destroy(); try { fs.unlinkSync(outPath); } catch { /* noop */ } resolve(false); } });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(true)));
      file.on("error", () => { try { fs.unlinkSync(outPath); } catch { /* noop */ } resolve(false); });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

// Real pixel dimensions via ffprobe (handles png/jpg/webp/gif/avif). null on fail.
function imageSize(p) {
  return new Promise((resolve) => {
    const ff = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", p]);
    let out = ""; ff.stdout.on("data", (d) => (out += d.toString()));
    const timer = setTimeout(() => { try { ff.kill("SIGKILL"); } catch { /* noop */ } }, 15000);
    ff.on("error", () => { clearTimeout(timer); resolve(null); });
    ff.on("exit", (code) => { clearTimeout(timer); if (code !== 0) return resolve(null); try { const s = JSON.parse(out).streams[0]; resolve(s && s.width > 0 ? { width: s.width, height: s.height } : null); } catch { resolve(null); } });
  });
}

// Parse a CSS rgb()/rgba() color to {r,g,b} + perceptual luminance (0..1). null if unusable.
function parseBg(css) {
  if (!css) return null;
  const m = String(css).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const r = +m[1], g = +m[2], b = +m[3];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return { hex: "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(), lum, isDark: lum < 0.5 };
}

// The page's GROUND color from the hero screenshot — the single most frequent
// color INCLUDING neutrals (whites/blacks/greys), i.e. the actual page background.
// (getComputedStyle(body) is often transparent because sites paint the bg on a
// wrapper div, so this screenshot-based read is the reliable fallback.) Returns
// { hex, lum, isDark } or null.
function groundColor(screenshotPath) {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", screenshotPath, "-vf", "scale=48:48", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    const chunks = [];
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.on("error", () => resolve(null));
    ff.on("exit", (code) => {
      if (code !== 0) return resolve(null);
      const buf = Buffer.concat(chunks);
      const buckets = new Map();
      for (let i = 0; i + 2 < buf.length; i += 3) {
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        const key = `${r >> 4}_${g >> 4}_${b >> 4}`; // coarse buckets — the ground dominates
        const e = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        e.count++; e.r += r; e.g += g; e.b += b; buckets.set(key, e);
      }
      const top = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
      if (!top) return resolve(null);
      const r = Math.round(top.r / top.count), g = Math.round(top.g / top.count), b = Math.round(top.b / top.count);
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      resolve({ hex: "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(), lum, isDark: lum < 0.5 });
    });
  });
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
      // Kept RAW (nav/forms intact) purely for auth-wall detection below — the
      // "continue with Google" signal lives in exactly the chrome the brief text
      // strips out.
      const rawText = (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 4000);
      // The brief's ONLY view of what this product DOES. Raw body innerText is
      // front-loaded with nav menus, cookie banners and footers, so on a marketing
      // homepage the old 4000-char window was spent before reaching a single
      // sentence of product copy — which is why briefs came back vague and the
      // script, bound by "facts only from the brief", had nothing concrete to say.
      // Prefer the main content region, strip the furniture, and buy more of it.
      const bodyText = (() => {
        const pick = document.querySelector("main, [role='main'], article") || document.body;
        let root = null;
        try { root = pick.cloneNode(true); } catch { root = null; }
        if (root) {
          root.querySelectorAll([
            "nav", "header", "footer", "aside", "script", "style", "noscript", "svg",
            "[role='navigation']", "[role='banner']", "[role='contentinfo']", "[aria-hidden='true']",
            "[id*='cookie']", "[class*='cookie']", "[id*='consent']", "[class*='consent']",
            "[id*='banner']", "[class*='skip-link']",
          ].join(",")).forEach((n) => { try { n.remove(); } catch { /* noop */ } });
        }
        return ((root || document.body).innerText || "")
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
          .slice(0, 9000);
      })();
      // The product's OWN account of each capability: a section heading paired with
      // the copy directly beneath it. This is the highest-signal product text on a
      // marketing page (it is literally "here is what this feature does") and none
      // of it was reaching the brief — only bare headings were.
      const featureCopy = (() => {
        const out = [];
        for (const h of document.querySelectorAll("h2, h3")) {
          const head = h.textContent.replace(/\s+/g, " ").trim();
          if (head.length < 3 || head.length > 120) continue;
          let el = h.nextElementSibling, body = "";
          for (let i = 0; i < 3 && el && !body; i++) {
            if (/^(P|UL|OL|DIV|SPAN)$/.test(el.tagName)) {
              body = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 240);
            }
            el = el.nextElementSibling;
          }
          if (body && body.length > 20) out.push(`${head} — ${body}`);
          if (out.length >= 14) break;
        }
        return out;
      })();
      // Auth-wall detection: many app domains (e.g. claude.ai) redirect to a
      // sign-in/login page, so the "hero" screenshot becomes a login form, not
      // the product. Flag it so we DON'T pin those shots as product visuals.
      const authWall = (() => {
        const t = (document.title || "").toLowerCase();
        const u = location.href.toLowerCase();
        const hasPw = !!document.querySelector('input[type="password"]');
        const oauth = /continue with (google|apple|github|microsoft|sso)|sign in with|log in with/i.test(rawText);
        const titleHit = /\b(sign ?in|log ?in|login|sign ?up)\b/.test(t);
        const urlHit = /\/(login|sign-?in|signup|sign-?up|auth|account\/login|u\/login)/.test(u);
        const sparse = document.querySelectorAll("h1,h2,h3").length <= 2 && rawText.length < 1200;
        return ((titleHit || urlHit) && (hasPw || oauth)) || (hasPw && oauth && sparse);
      })();
      // Internal page map (nav/footer/body anchors) — fuels the Screenshot
      // Director, which later captures the pages that match each scene's topic
      // (pricing scene -> /pricing shot). Same-origin only, deduped by pathname.
      const pageLinks = (() => {
        const seen = new Set();
        const out = [];
        for (const a of document.querySelectorAll("a[href]")) {
          let u2; try { u2 = new URL(a.getAttribute("href"), location.href); } catch { continue; }
          if (!/^https?:$/.test(u2.protocol) || u2.hostname !== location.hostname) continue;
          const p = u2.pathname.replace(/\/+$/, "") || "/";
          if (p === (location.pathname.replace(/\/+$/, "") || "/")) continue; // self
          const key = p.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const text = (a.innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 60);
          out.push({ url: u2.origin + p, text });
          if (out.length >= 60) break;
        }
        return out;
      })();
      // The page's own GROUND color (for matching the film's theme to the site).
      const bgColor = (() => {
        for (const el of [document.body, document.documentElement]) {
          const c = el && getComputedStyle(el).backgroundColor;
          if (c && !/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i.test(c)) return c;
        }
        return null;
      })();
      // The site's OWN prominent images (hero graphics, product shots,
      // illustrations) — logos/icons/tracking pixels filtered out by rendered
      // size. Largest first; the biggest srcset candidate is preferred.
      const heroImages = (() => {
        const seen = new Set(); const out = [];
        const add = (src, alt, area) => {
          if (!src || seen.has(src)) return;
          if (/^data:/i.test(src) && src.length < 20000) return; // tiny inline icons
          seen.add(src); out.push({ src, alt: (alt || "").replace(/\s+/g, " ").trim().slice(0, 140), area });
        };
        for (const img of document.querySelectorAll("img")) {
          const r = img.getBoundingClientRect();
          const area = r.width * r.height;
          if (area < 130 * 130) continue; // skip logos / icons / trackers
          let src = img.currentSrc || img.src;
          if (img.srcset) {
            const best = img.srcset.split(",").map((s) => s.trim().split(/\s+/)).filter((a) => a[0])
              .sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0];
            if (best) { try { src = new URL(best[0], location.href).href; } catch { /* keep */ } }
          }
          add(src, img.alt || img.getAttribute("aria-label"), area);
        }
        for (const el of document.querySelectorAll("section,header,div,figure,a")) {
          const r = el.getBoundingClientRect();
          const area = r.width * r.height;
          if (area < 320 * 200) continue;
          const bg = getComputedStyle(el).backgroundImage;
          if (!bg || bg === "none" || /gradient/i.test(bg)) continue;
          const m = bg.match(/url\(["']?(.*?)["']?\)/);
          if (m && m[1]) { try { add(new URL(m[1], location.href).href, "hero background", area); } catch { /* skip */ } }
          if (out.length > 60) break;
        }
        return out.sort((a, b) => b.area - a.area).slice(0, 16).map((x) => ({ src: x.src, alt: x.alt }));
      })();
      // The site's LOGO (its actual brand mark). The hero sweep above deliberately
      // drops anything under 130x130 — which is exactly logo-sized — so the mark
      // every CTA scene wants was never captured. Look where logos really live:
      // the masthead first, then the page's declared icon links.
      const logo = (() => {
        const abs = (u) => { try { return u ? new URL(u, location.href).href : null; } catch { return null; } };
        const cands = [];
        const scopes = document.querySelectorAll("header, nav, [class*='logo'], [id*='logo'], [class*='Logo']");
        for (const sc of Array.from(scopes).slice(0, 40)) {
          for (const img of sc.querySelectorAll("img")) {
            const rr = img.getBoundingClientRect();
            if (rr.width < 16 || rr.height < 16) continue;
            if (rr.top > 420) continue; // must sit in the masthead, not a footer badge
            const hay = `${img.alt || ""} ${img.className || ""} ${img.id || ""} ${img.src || ""}`.toLowerCase();
            cands.push({
              src: abs(img.currentSrc || img.src),
              score: (/logo|brand|wordmark/.test(hay) ? 120 : 0) + Math.min(60, rr.width),
              w: rr.width, h: rr.height,
            });
          }
        }
        for (const l of document.querySelectorAll("link[rel~='icon'],link[rel='apple-touch-icon'],link[rel='apple-touch-icon-precomposed'],link[rel='mask-icon']")) {
          const relv = (l.getAttribute("rel") || "").toLowerCase();
          const sz = parseInt(String(l.getAttribute("sizes") || "").split(/[x\s]/)[0], 10) || 0;
          cands.push({ src: abs(l.getAttribute("href")), score: 25 + sz / 8 + (/apple/.test(relv) ? 30 : 0), w: sz, h: sz });
        }
        const best = cands.filter((c) => c.src).sort((a, b) => b.score - a.score)[0];
        return best ? { src: best.src, width: Math.round(best.w) || null, height: Math.round(best.h) || null } : null;
      })();
      return {
        title: document.title || null,
        description: meta("description") || meta("og:description"),
        ogImage: meta("og:image"),
        headings,
        bodyText,
        featureCopy,
        authWall,
        pageLinks,
        bgColor,
        heroImages,
        logo,
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
        // Was two section grabs (0.35 / 0.7). A product film wants SIX-PLUS real
        // screenshots, and the deep sections are where the product actually gets
        // shown (features, proof, pricing) — the hero is mostly headline. Each is
        // cheap (one scroll + one shot); blanks and duplicates are dropped later by
        // screenshot QA and the Creative Director.
        for (const [i, frac] of [[2, 0.22], [3, 0.4], [4, 0.58], [5, 0.76], [6, 0.9]]) {
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

    // HIGH-QUALITY UPGRADE (PeekShot) — replace the local hero and, when the
    // page is tall enough, the deep-section shots with managed-infrastructure
    // retina captures (2732x1800 for the same 1366x900@2x window; ads blocked,
    // our consent killer injected). Strictly fail-soft: any error/timeout keeps
    // the local puppeteer shots. Sections come from ONE full-page capture,
    // cropped locally — no lazy-load pop-in mid-scroll like the local path.
    if (!isAuthWall && peekshot.enabled()) {
      const t0 = Date.now();
      const fullPath = path.join(workDir, "website_full.png");
      const [heroRes, fullRes] = await Promise.allSettled([
        peekshot.capture({ url, outPath: heroPath, width: 1366, height: 900, retina: true, delay: 3, timeoutMs: 75_000 }),
        peekshot.capture({ url, outPath: fullPath, width: 1366, height: 900, retina: true, fullPage: true, delay: 3, timeoutMs: 90_000 }),
      ]);
      if (heroRes.status === "fulfilled") {
        console.log(`[ingest] peekshot hero replaced local shot (${Math.round(heroRes.value.bytes / 1024)}KB retina)`);
      } else {
        console.warn(`[ingest] peekshot hero skipped: ${String(heroRes.reason?.message || heroRes.reason).slice(0, 160)}`);
      }
      if (fullRes.status === "fulfilled") {
        try {
          const dim = pngSize(fullPath);
          const winH = dim ? Math.round(dim.width * (900 / 1366)) : 0;
          let made = 0;
          if (dim && winH && dim.height >= winH * 2.2) {
            // Same widening as the local path: crop five deep sections out of the
            // one retina full-page capture instead of two.
            for (const [i, frac] of [[2, 0.22], [3, 0.4], [4, 0.58], [5, 0.76], [6, 0.9]]) {
              const y = Math.floor((dim.height - winH) * frac);
              if (y < winH * 0.5) continue; // too short for distinct sections
              const p = path.join(workDir, `website_section${i}.png`);
              await cropPng(fullPath, p, 0, y, dim.width, winH);
              if (!screenshotPaths.includes(p)) screenshotPaths.push(p);
              made++;
            }
          }
          if (made) console.log(`[ingest] peekshot full-page (${dim.width}x${dim.height}) -> ${made} section crop(s)`);
        } catch (e) {
          console.warn(`[ingest] peekshot section crops failed: ${e.message}`);
        }
        fs.rmSync(fullPath, { force: true }); // crops only; don't bloat the job dir
      } else {
        console.warn(`[ingest] peekshot full-page skipped: ${String(fullRes.reason?.message || fullRes.reason).slice(0, 160)}`);
      }
      console.log(`[ingest] peekshot pass finished in ${Math.round((Date.now() - t0) / 1000)}s`);
    }

    const brandColors = await dominantColors(heroPath).catch(() => []);
    const screenshotPath = isAuthWall ? null : heroPath;

    // Download the site's OWN prominent images so they become first-class film
    // assets (its real UI/brand imagery beats any stock photo). Fail-soft per img;
    // filtered to real, reasonably-sized, non-banner pictures.
    const siteImages = [];
    if (!isAuthWall && Array.isArray(data.heroImages) && data.heroImages.length) {
      const imgDir = path.join(workDir, "site_images");
      fs.mkdirSync(imgDir, { recursive: true });
      let idx = 0;
      for (const im of data.heroImages) {
        if (siteImages.length >= 10) break;
        const clean = String(im.src).split("?")[0];
        const ext = (clean.match(/\.(png|jpe?g|webp|gif|avif)$/i)?.[1] || "jpg").toLowerCase();
        const out = path.join(imgDir, `site_img_${idx++}.${ext}`);
        if (!(await downloadImage(im.src, out, url))) continue;
        const dim = await imageSize(out);
        if (!dim || Math.max(dim.width, dim.height) < 340) { try { fs.unlinkSync(out); } catch { /* noop */ } continue; }
        const ar = dim.width / dim.height;
        if (ar > 6 || ar < 0.16) { try { fs.unlinkSync(out); } catch { /* noop */ } continue; } // skip 1px strips / thin banners
        // INFORMATION FLOOR. A site's "hero images" are mostly promo furniture:
        // flat colour panels and gradient banner strips. They pass every check
        // above (big enough, sane aspect) and then land in a showcase card as a
        // featureless rectangle — a real film shipped a 1.8KB flat lavender block
        // as one of four product tiles. Stock assets already clear this exact bar
        // inside acquire(); scraped site images never went through it.
        const sig = await imageDHashStats(out);
        if (sig && sig.stdev != null && sig.stdev < SITE_IMG_MIN_STDEV) {
          console.log(`[ingest] drop flat site image (stdev ${sig.stdev.toFixed(1)}): ${clean.slice(-60)}`);
          try { fs.unlinkSync(out); } catch { /* noop */ }
          continue;
        }
        siteImages.push({
          path: out, alt: im.alt || null, width: dim.width, height: dim.height,
          stdev: sig && sig.stdev != null ? sig.stdev : null,
        });
      }
      console.log(`[ingest] downloaded ${siteImages.length} site image(s) from ${data.heroImages.length} candidate(s)`);
    }
    // The LOGO is downloaded on its own path, never through the sweep above: the
    // sweep's 130x130 rendered floor and 340px file floor both reject a brand mark
    // by design. template_engine ALREADY looks for an asset whose kind is "logo"
    // (isLogo) and hands it to whichever scene the pack's wantsLogo() asks for —
    // nothing was ever PRODUCING one, which is why films never showed the brand.
    // Named logo.<ext> so isLogo's path test matches even if `kind` is ever lost.
    let siteLogo = null;
    if (data.logo && data.logo.src) {
      try {
        const clean = String(data.logo.src).split("?")[0];
        const ext = (clean.match(/\.(png|jpe?g|webp|gif|avif|svg|ico)$/i)?.[1] || "png").toLowerCase();
        const out = path.join(workDir, `logo.${ext}`);
        if (await downloadImage(data.logo.src, out, url)) {
          if (ext === "svg") {
            // Vector: no raster dimensions to measure, and always safe to letterbox.
            siteLogo = { path: out, width: null, height: null, alt: "logo" };
          } else {
            const dim = await imageSize(out);
            // A real mark is at least 32px on its long edge; anything smaller is a
            // tracking pixel or a broken favicon.
            if (dim && Math.max(dim.width, dim.height) >= 32) {
              siteLogo = { path: out, width: dim.width, height: dim.height, alt: "logo" };
            } else {
              try { fs.unlinkSync(out); } catch { /* noop */ }
            }
          }
        }
      } catch (e) {
        console.warn(`[ingest] logo download failed: ${e.message}`);
      }
      console.log(siteLogo
        ? `[ingest] logo captured (${siteLogo.width || "vector"}${siteLogo.height ? `x${siteLogo.height}` : ""}) -> ${path.basename(siteLogo.path)}`
        : `[ingest] logo candidate found but unusable (${String(data.logo.src).slice(0, 80)})`);
    }
    delete data.logo; // the raw url is noise for the brief; siteLogo carries the asset
    // Prefer the page's declared body/html bg; fall back to the screenshot's
    // dominant color (reliable when the site paints its ground on a wrapper).
    const theme = parseBg(data.bgColor) || await groundColor(heroPath).catch(() => null);
    delete data.heroImages; // raw urls are noise for the brief; siteImages carry the assets

    console.log(`[ingest] website understood: "${data.title}" — ${data.headings.length} headings, ${data.bodyText.length}ch body, ${screenshotPaths.length} usable screenshot(s)${isAuthWall ? " (auth wall — screenshots suppressed)" : ""}, ${(data.pageLinks || []).length} internal page link(s), colors=${brandColors.join(",")}${theme ? ` ground=${theme.hex}(${theme.isDark ? "dark" : "light"})` : ""}, ${siteImages.length} site image(s)`);
    return { url, ...data, isAuthWall, brandColors, screenshotPath, screenshotPaths, siteImages, siteLogo, siteBg: theme ? theme.hex : null, siteDark: theme ? theme.isDark : null };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { understandWebsite, findChrome };
