// Ingest worker 1c: blog/article URL -> structured understanding + its images.
//
// The website worker (1b) reads a MARKETING site: headings, hero screenshots,
// brand colors. A BLOG POST is a different animal — the film must be built
// from the ARTICLE ITSELF (its argument, its sections, its numbers), and the
// post's own inline images are the most on-topic visuals any pipeline could
// fetch. This worker extracts exactly that:
//
//   { url, title, author, published, headings[], text, images:[{path, alt}],
//     externalLinks:[{href, host, context}] }
//
// Extraction runs in-page on the same cached Chrome the renderer uses
// (puppeteer-core, findChrome from the website worker): pick the <article> /
// <main> / densest text container, read its innerText + section headings, then
// DOWNLOAD the big inline images (og:image first) so they become first-class
// owner-content assets. Fail-soft per image; throws only when no article text
// could be extracted at all (caller degrades to null like the other workers).

const fs = require("node:fs");
const path = require("node:path");
const { findChrome } = require("./website");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

// Download one image URL to disk. Returns bytes written, or 0 on any failure
// (caller drops it) — a blog image must never fail the ingest.
async function downloadImage(url, outPath, referer) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8", ...(referer ? { Referer: referer } : {}) },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return 0;
    const type = String(res.headers.get("content-type") || "");
    if (type && !/image\//i.test(type)) return 0;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 15_000) return 0; // icons/trackers — not article imagery
    fs.writeFileSync(outPath, buf);
    return buf.length;
  } catch { return 0; }
}

const extFor = (u, fallback = ".jpg") => {
  const m = /\.(jpe?g|png|webp)(?:$|\?)/i.exec(String(u));
  return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : fallback;
};

async function understandBlog({ url, workDir, timeoutMs = 60_000 }) {
  const chrome = findChrome();
  if (!chrome) throw new Error("no Chrome found for blog ingest (set PUPPETEER_EXECUTABLE_PATH or config.ingest.chromePath)");
  fs.mkdirSync(workDir, { recursive: true });

  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1366,900"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
    await page.setUserAgent(UA);
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
    await new Promise((r) => setTimeout(r, 1000)); // lazy content settles
    // Scroll once through the page so lazy-loaded article images get real srcs.
    await page.evaluate(async () => {
      const h = Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight || 0);
      for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    }).catch(() => {});

    const data = await page.evaluate(() => {
      const meta = (n) =>
        document.querySelector(`meta[name="${n}"]`)?.content ||
        document.querySelector(`meta[property="${n}"]`)?.content || null;

      // The article container: semantic first, else the element holding the
      // most paragraph text (readability-lite — enough for headings/text/imgs).
      let root = document.querySelector("article") || document.querySelector("main");
      if (!root) {
        let best = null, bestLen = 0;
        for (const el of document.querySelectorAll("div,section")) {
          const ps = el.querySelectorAll(":scope > p, :scope > * > p");
          if (ps.length < 3) continue;
          let len = 0; ps.forEach((p) => { len += (p.innerText || "").length; });
          if (len > bestLen) { bestLen = len; best = el; }
        }
        root = best || document.body;
      }

      const title = (meta("og:title") || document.querySelector("h1")?.innerText || document.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
      const author = (meta("author") || meta("article:author") ||
        document.querySelector('[rel="author"], .author, .byline [itemprop="name"], .byline')?.innerText || "")
        .replace(/\s+/g, " ").trim().slice(0, 120);
      const published = (meta("article:published_time") ||
        document.querySelector("time[datetime]")?.getAttribute("datetime") || "").slice(0, 40);

      const headings = [...root.querySelectorAll("h2, h3")]
        .map((h) => (h.innerText || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 2 && t.length < 160)
        .slice(0, 16);

      // Long-form (5-10min) films draw on the WHOLE article, not just its lead —
      // 14,000 chars was cutting a real ~2,500-word post down to its first third.
      // 60,000 chars covers the longest realistic blog post; downstream stages
      // (project_pipeline's brief excerpt, script generation) do their own
      // duration-aware summarization on top of this.
      const text = (root.innerText || "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 60000);

      // Outbound links the article itself points to (a tool, a competitor, a
      // dataset source, a product it reviews) — candidates for related-website
      // screenshots. Internal nav/anchor/social-share links are noise, so keep
      // only links that (a) leave the article's own host and (b) sit inside
      // real body copy (a <p>/<li>, not a header/footer/nav chrome element).
      // Compare REGISTRABLE domain, not exact host — docs.stripe.com and
      // status.stripe.com are the article's own company, not a "related site"
      // the article is pointing a viewer at, even though the hostname differs.
      const baseDomain = (h) => h.split(".").slice(-2).join(".");
      const ownHost = location.hostname.replace(/^www\./, "");
      const ownBase = baseDomain(ownHost);
      const linkSeen = new Set();
      const externalLinks = [];
      for (const a of root.querySelectorAll("p a[href], li a[href]")) {
        const href = a.href || "";
        if (!/^https?:/i.test(href)) continue;
        let host;
        try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { continue; }
        if (!host || host === ownHost || baseDomain(host) === ownBase) continue;
        if (/(twitter|x)\.com|facebook\.com|linkedin\.com|instagram\.com|youtube\.com|reddit\.com|t\.co|bit\.ly/i.test(host)) continue;
        if (a.closest("nav,header,footer,[role=navigation]")) continue; // chrome, not article copy
        if (linkSeen.has(host)) continue;
        linkSeen.add(host);
        const context = (a.closest("p,li")?.innerText || a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 240);
        externalLinks.push({ href, host, text: (a.innerText || "").trim().slice(0, 100), context });
        if (externalLinks.length >= 8) break;
      }

      // Big inline images from the article body — the post's own visuals.
      const seen = new Set();
      const images = [];
      const push = (src, alt, w, h) => {
        if (!src || seen.has(src)) return;
        seen.add(src);
        images.push({ src, alt: (alt || "").replace(/\s+/g, " ").trim().slice(0, 160), w, h });
      };
      for (const img of root.querySelectorAll("img")) {
        const src = img.currentSrc || img.src || "";
        if (!/^https?:/i.test(src)) continue;
        if (/\.(svg|gif)(\?|$)/i.test(src)) continue;
        const w = img.naturalWidth || 0, h = img.naturalHeight || 0;
        if (w && (w < 480 || h < 260)) continue;      // avatars, badges, inline icons
        if (w && h && (w / h > 4 || h / w > 4)) continue; // banners/dividers
        push(src, img.getAttribute("alt"), w, h);
        if (images.length >= 20) break;
      }
      const og = meta("og:image");
      if (og && /^https?:/i.test(og)) images.unshift({ src: og, alt: "cover image", w: 0, h: 0 });

      return { title, author, published, headings, text, images: images.slice(0, 20), externalLinks };
    });

    if (!data.text || data.text.length < 400) {
      throw new Error(`page does not read as an article (only ${data.text ? data.text.length : 0} chars of body text)`);
    }

    // Download the article's images (cover first) as owner-content assets. Long
    // -form films weave in far more inline imagery than a short-form clip could
    // ever use, so the cap here is raised to feed that demand (still fail-soft
    // per image; asset density downstream tops up with stock beyond this).
    const images = [];
    for (const [i, im] of data.images.entries()) {
      if (images.length >= 12) break;
      const out = path.join(workDir, `blog_img_${i}${extFor(im.src)}`);
      const bytes = await downloadImage(im.src, out, url);
      if (bytes) images.push({ path: out, alt: im.alt || "", width: im.w || undefined, height: im.h || undefined });
    }

    console.log(`[ingest] blog understood: "${data.title}" — ${data.headings.length} section(s), ${data.text.length}ch article, ${images.length} image(s) downloaded, ${data.externalLinks.length} external link(s)${data.author ? `, by ${data.author}` : ""}`);
    return {
      url, title: data.title, author: data.author, published: data.published,
      headings: data.headings, text: data.text, images, externalLinks: data.externalLinks,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { understandBlog };
