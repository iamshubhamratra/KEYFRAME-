// Ingest worker 1b: website URL -> structured understanding.
//
// Drives a cached Chrome (the one HyperFrames' renderer already downloaded
// into ~/.cache/puppeteer) via puppeteer-core: captures title/meta/headings/
// body text, the OG image, a full-page screenshot, and dominant brand colors
// (screenshot -> ffmpeg rawvideo downscale -> saturation-weighted quantize —
// no native image deps needed).
//
// Output: { url, title, description, headings[], bodyText, brandColors[], ogImage,
//           isAuthWall, screenshotPath, screenshotPaths[], assets[], harvestReview }
//   assets / harvestReview are present only when the Website Asset Intelligence
//   harvester is enabled (config.harvester.enabled) — the site's own brand-asset
//   FILES (logo/icons/hero images), collected off this same page session.

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

// Overlay clearing, page-stability waiting, semantic section finding and the
// dismiss→verify→escalate capture loop all live in ./capture.js. See that file's
// header for the audit that produced it (shadow-DOM CMPs + the dimming scrim were
// invisible to the selector-only approach this replaced).
const {
  clearOverlays, assessViewport, waitForStable,
  findSections, frameSection, captureViewport, waitForConsent,
  MIN_CONTENT_SCORE,
} = require("./capture");

// `sectionTarget` — how many CONTENT SECTION screenshots to keep. Defaults to the historical
// 3 so any caller that has not been taught about template appetite behaves exactly as before.
async function understandWebsite({ url, workDir, timeoutMs = 60_000, sectionTarget = 3 }) {
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
    // NAVIGATE on `domcontentloaded`, not `networkidle2`.
    //
    // networkidle2 waits for <=2 in-flight connections for 500ms, which never happens
    // on a site holding analytics beacons, a chat socket or any long-poll open — so
    // goto burned the whole 60s budget and THREW, losing the page entirely. Observed
    // on wisprflow.ai: the identical capture succeeds in ~28s when the wait is right
    // and times out at 60s when it is networkidle2. Losing every screenshot because a
    // third-party beacon stayed open is a bad trade.
    //
    // Readiness is waitForStable's job anyway (fonts loaded, in-view images decoded,
    // two settled animation frames) and it measures what actually matters for a
    // screenshot rather than proxying it through socket counts. A slow-but-alive page
    // now degrades to "capture it a little early" instead of "capture nothing".
    // IS THIS THE SITE, OR THE SERVER SAYING IT ISN'T?
    //
    // goto returns the navigation response and this discarded it, so an HTTP error page was
    // ingested exactly like a real homepage. Job po0ltq31c4 is the whole failure in one line:
    // https://brandfetch.com/ answers 404 with the stock Apache page, and the pipeline shot it
    // twice (one "blank", one "broken" at 0% coverage), harvested 0 assets from it, read its
    // brand as system-ui and a single grey, and then spent a full render making a 30-second
    // film about a company from an error page. It scored 5/100 and nothing anywhere said the
    // URL was dead.
    //
    // A status alone is not proof — some working sites answer non-2xx on the document and
    // hydrate fine — so it is corroborated against the page itself: an error page is tiny,
    // pictureless, and says so. Both together are conclusive; either alone only warns.
    let navStatus = null;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(timeoutMs, 45_000) });
      if (resp) navStatus = resp.status();
    } catch (e) {
      // A navigation timeout does not mean an empty page — the document usually
      // painted long before the last request settled. Continue if we have content;
      // only rethrow when there is genuinely nothing to read.
      const painted = await page.evaluate(() => !!document.body && document.body.innerText.trim().length > 40).catch(() => false);
      if (!painted) throw e;
      console.warn(`[ingest] navigation did not settle (${e.message.slice(0, 60)}) — the page has painted, continuing`);
    }
    // Now wait for the page to be genuinely photographable — fonts loaded, in-view
    // images decoded, layout settled — instead of sleeping a flat 1200ms and
    // shooting whatever happened to be painted.
    await waitForStable(page, { timeoutMs: 8000 });

    // The corroboration half of the status check above. Measured on the Apache 404 that job
    // po0ltq31c4 ingested: 11 DOM nodes, 0 images, 0 svgs, 114 characters of text reading
    // "The requested URL was not found on this server." A real homepage does not look like
    // that, whatever it answers on the wire.
    try {
      const shape = await page.evaluate(() => ({
        nodes: document.querySelectorAll("*").length,
        imgs: document.querySelectorAll("img,svg,picture,video").length,
        text: ((document.body && document.body.innerText) || "").replace(/\s+/g, " ").trim(),
      }));
      // CONTENTLESS IS THE TEST, NOT THE WORDING. The first version of this also required the
      // page to SAY "not found"/"error", and brandfetch.com promptly proved why that is wrong:
      // within the same hour it served an Apache 404 and a Cloudflare "Just a moment..."
      // challenge (HTTP 403, 44 nodes, 0 images). Both are equally useless to a film and only
      // one admits it — and a non-English error page admits it in words this would not match.
      // A real homepage that answers non-2xx still has a homepage's worth of DOM and pictures,
      // so shape alone separates them.
      const looksLikeError = shape.nodes < 60 && shape.imgs === 0 && shape.text.length < 600;
      const badStatus = navStatus != null && (navStatus < 200 || navStatus >= 400);
      if (badStatus && looksLikeError) {
        // Hard stop. Everything downstream — captures, harvest, brand extraction — would be
        // reading the error page, and the film that results is worse than no film because it
        // looks finished. The caller degrades to prompt-only and tells the user which URL died.
        const err = new Error(`the site returned HTTP ${navStatus} and served an error page, not a website (${url})`);
        err.code = "SITE_UNAVAILABLE";
        err.status = navStatus;
        throw err;
      }
      if (badStatus || looksLikeError) {
        console.warn(`[ingest] ${url} looks doubtful (HTTP ${navStatus == null ? "?" : navStatus}, ${shape.nodes} nodes, ${shape.imgs} image(s)) — capturing anyway`);
      }
    } catch (e) {
      if (e && e.code === "SITE_UNAVAILABLE") throw e;
      /* shape probe is best-effort; never block a capture on it */
    }

    // Give the consent platform a bounded chance to APPEAR before we dismiss it.
    // Consent scripts load async and are routinely absent at this point — dismissing
    // an empty page then shooting seconds later is how a banner got into a capture
    // that our own checks had already declared clean. Returns as soon as one shows up.
    const sawConsent = await waitForConsent(page, { timeoutMs: 4000 });
    if (sawConsent) console.log("[ingest] consent layer detected — dismissing before capture");
    // Give late hero media a beat, then settle again (SPAs paint their hero after
    // hydration, which domcontentloaded deliberately does not wait for).
    await new Promise((r) => setTimeout(r, 900));
    await waitForStable(page, { timeoutMs: 4000 });
    // Clear consent/newsletter/chat/promo overlays — and their dimming scrim and
    // body scroll-lock — before we read or screenshot anything. (isAuthWall is not
    // known yet; the accept/reject click is anchored to full-string labels that
    // never match a login control, so it is safe.)
    const overlayReport = await clearOverlays(page);
    if (overlayReport.clicked || overlayReport.removedHosts.length) {
      console.log(`[ingest] overlays cleared${overlayReport.clicked ? ` — clicked "${overlayReport.clicked}"` : ""}${overlayReport.removedHosts.length ? ` — removed ${[...new Set(overlayReport.removedHosts)].join(", ")}` : ""}`);
    }

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
      // Dead-page detection: a 404/410/500 still renders, still screenshots, and still carries
      // a title — so it flows downstream as a "REAL website screenshot" and gets printed as the
      // product. A shipped film put an "Oops, the page you requested could not be found!" capture
      // on two figure plates, captioned OVERVIEW, because nothing between capture and render
      // asked whether the page was alive. Same treatment as the auth wall: suppress the shots.
      //
      // Conservative on purpose — a title or heading hit, or an explicit dead-page phrase on a
      // sparse page. A marketing page that merely mentions "404" somewhere in its copy is not a
      // dead page and must not be suppressed.
      const deadPage = (() => {
        const t = (document.title || "").toLowerCase().trim();
        const h1 = (document.querySelector("h1") || {}).textContent || "";
        const head = h1.toLowerCase().trim();
        const codeRe = /(^|\s)(404|410|403|500|502|503)(\s|$|[^0-9])/;
        const phraseRe = /\b(page not found|not found|page (you (requested|were looking for) )?(could not be|couldn'?t be|cannot be) found|page does(n'?t| not) exist|no longer exists|internal server error|service unavailable|forbidden)\b/;
        const titleHit = codeRe.test(t) || phraseRe.test(t);
        const headHit = codeRe.test(head) || phraseRe.test(head);
        const sparse = document.querySelectorAll("h1,h2,h3").length <= 3 && bodyText.length < 1200;
        return titleHit || headHit || (phraseRe.test(bodyText.toLowerCase()) && sparse);
      })();
      return {
        title: document.title || null,
        description: meta("description") || meta("og:description"),
        ogImage: meta("og:image"),
        headings,
        bodyText,
        authWall,
        deadPage,
      };
    });
    const isAuthWall = !!data.authWall;
    const isDeadPage = !!data.deadPage;
    delete data.authWall;
    delete data.deadPage;
    if (isAuthWall) console.warn(`[ingest] "${data.title}" looks like a sign-in / auth wall — NOT using its screenshots as product visuals`);
    if (isDeadPage) console.warn(`[ingest] "${data.title}" looks like a dead page (404/error) — NOT using its screenshots as product visuals`);
    // Both conditions mean the same thing downstream: whatever rendered is not the product, and
    // no smaller slot or dimmer treatment can rescue it. Gate the captures on the pair.
    const noProductShots = isAuthWall || isDeadPage;

    // ---- CAPTURE ---------------------------------------------------------
    // `shots` carries per-capture QUALITY METADATA alongside the path. That is the
    // contract change the audit forced: a path alone cannot tell the intake gate
    // that a consent bar covered 85% of the frame, so the old pipeline shipped
    // contaminated captures and merely "demoted" them into the film.
    const shots = [];
    const record = (cap, kind, heading) => {
      if (!cap) return;
      shots.push({
        path: cap.path,
        clean: cap.clean,
        kind,
        heading: heading || "",
        obstructions: cap.assessment.obstructions || [],
        maxCoveragePct: cap.assessment.maxCoveragePct || 0,
        contentScore: cap.assessment.contentScore || 0,
        dismissPasses: cap.attempts,
      });
    };

    // HERO. Captured regardless of auth-wall status — brand colours are still
    // extracted from it — but only OFFERED as a product visual below.
    const heroPath = path.join(workDir, "website.png");
    const hero = await captureViewport(page, { outPath: heroPath, isAuthWall });
    record(hero, "hero", data.headings[0] || "");
    if (hero && !hero.clean) {
      console.warn(`[ingest] hero capture still obstructed after ${hero.attempts} dismissal pass(es): ${hero.assessment.obstructions.map((o) => `${o.kind} ${o.pct}%`).join(", ")}`);
    }

    // SECTIONS. Real content sections, ranked for what a marketing film wants to
    // show, framed to their own top edge — not the old "scroll to 35% and 70% of
    // the page", which sliced cards in half and framed empty bands. We walk MORE
    // candidates than we need and keep the ones that pass the content floor, so a
    // weak section is skipped rather than shipped.
    if (!noProductShots) {
      try {
        const viewH = 900;
        const sections = await findSections(page);
        // HOW MANY SECTIONS TO KEEP — the template's appetite, not a fixed 3.
        //
        // This was `Math.min(3, ...)`, and it is the reason templates starve of the highest-
        // tier visual material there is. Measured on a real razorpay.com ingest: the page
        // offered EIGHT candidate sections and this line allowed three. Meanwhile `drive`
        // declares it can place 13 screenshots and `showcase` 10 — so the ceiling that decided
        // how much of the product a film could show was a literal, chosen before any template
        // existed to ask.
        //
        // `sectionTarget` comes from the resolved media contracts (see the caller). We still
        // walk MORE candidates than we keep, so the content floor below can reject a weak
        // section rather than ship it — the target is what we KEEP, not what we try.
        const want = Math.min(Math.max(1, sectionTarget), Math.max(1, sections.length));
        let taken = 0, idx = 0;
        console.log(`[ingest] found ${sections.length} candidate section(s): ${sections.slice(0, 6).map((s) => `${s.kind}(${s.score})`).join(" ")}`);
        for (const sec of sections) {
          if (taken >= want) break;
          idx++;
          await frameSection(page, sec, viewH);
          await waitForStable(page, { timeoutMs: 3500 });
          const p = path.join(workDir, `website_section${taken + 2}.png`);
          const cap = await captureViewport(page, { outPath: p, isAuthWall });
          if (!cap) continue;
          // Content floor — a viewport with almost nothing in it is a spacer band,
          // not a section. Skip it and try the next-ranked candidate.
          if (cap.assessment.contentScore < MIN_CONTENT_SCORE) {
            console.log(`[ingest] section ${idx} (${sec.kind}) skipped — content score ${cap.assessment.contentScore} < ${MIN_CONTENT_SCORE}`);
            try { fs.unlinkSync(p); } catch { /* noop */ }
            continue;
          }
          record(cap, sec.kind, sec.heading);
          taken++;
        }
        // Fallback: a page with no detectable sections (a single-div SPA) still
        // deserves deeper shots — fall back to the old fraction scroll, but with
        // the new clean/verify loop and content floor applied.
        if (!taken) {
          const pageH = await page.evaluate(() => Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight || 0));
          for (const frac of [0.35, 0.7]) {
            const y = Math.floor((pageH - viewH) * frac);
            if (y < viewH * 0.5) continue;
            await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
            await waitForStable(page, { timeoutMs: 3500 });
            const p = path.join(workDir, `website_section${taken + 2}.png`);
            const cap = await captureViewport(page, { outPath: p, isAuthWall });
            if (!cap) continue;
            if (cap.assessment.contentScore < MIN_CONTENT_SCORE) { try { fs.unlinkSync(p); } catch { /* noop */ } continue; }
            record(cap, "content", "");
            taken++;
          }
        }
      } catch (e) {
        console.warn(`[ingest] section screenshots failed: ${e.message}`);
      }
    }

    // Brand colours come from the hero — but ONLY when the hero is clean. A capture
    // taken under a consent scrim is desaturated by construction, and quantizing it
    // is how the audited film ended up with a grey "brand palette" while the site's
    // real teal sat unused. An obstructed hero yields no colours, so the pipeline
    // falls through to the CSS-computed palette instead of trusting a washed image.
    const brandColors = (hero && hero.clean)
      ? await dominantColors(heroPath).catch(() => [])
      : [];
    if (hero && !hero.clean) console.warn(`[ingest] skipping hero colour quantize — the capture is obstructed/dimmed and would yield a washed palette`);
    const screenshotPath = noProductShots ? null : heroPath;

    // WEBSITE ASSET INTELLIGENCE (opt-in): harvest the site's OWN brand-asset files
    // off this same, already-loaded, overlay-cleaned page — no 2nd navigation, no 2nd
    // Chrome. Fully fail-open: any failure yields assets:[] and never blocks ingest.
    let assets = [], harvestReview = null, brandSignals = null;
    if (config.harvester?.enabled) {
      try {
        // SCROLL BACK TO THE TOP FIRST — the single line that decides whether the harvest can
        // find the brand's logo at all.
        //
        // `discoverAssetsInPage` scores every candidate with `nearHeader`, which falls back to
        // `el.getBoundingClientRect().top < 220` — a VIEWPORT-relative measure. The section
        // capture loop above scrolls the page down (capture.frameSection -> window.scrollTo)
        // and never scrolls back, so by the time the harvest runs the viewport is parked
        // thousands of pixels into the page. Every element that happens to sit near the TOP OF
        // THAT VIEW then reads as "near the header", and the real header — long since scrolled
        // off — reads as not.
        //
        // `nearHeader` is worth 40 of the ~99 points in `logoStrength`, and it is the first
        // clause of the logo classifier. Measured across the cached harvests, 4 of 5 real sites
        // yielded ZERO logos. This restores the frame the measurement assumes.
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })).catch(() => {});
        await new Promise((r) => setTimeout(r, 150));   // let a sticky header re-pin
        const { harvestSiteAssets } = require("./website_assets");
        const h = await harvestSiteAssets({ page, baseUrl: url, workDir, isAuthWall });
        assets = h.files || [];
        harvestReview = h.review || null;
        brandSignals = h.brandSignals || null;
        console.log(`[ingest] harvested ${assets.length} brand asset(s) from ${new URL(url).host}${harvestReview && harvestReview.discovered ? ` (of ${harvestReview.discovered} discovered)` : ""}${brandSignals && brandSignals.fonts?.heading ? ` · heading font "${brandSignals.fonts.heading.family}"` : ""}`);
      } catch (e) { console.warn(`[ingest] brand-asset harvest skipped: ${e.message}`); }
    }

    // MOBILE-VIEWPORT capture — a portrait (phone) render of the SAME page, so a 9:16
    // film gets a NATIVE mobile product shot and the Visual Layout Director routes any
    // portrait capture into a phone mockup (deviceKind ratio<0.9). Captured LAST so it
    // can't affect the desktop shots or the harvest above; same navigation, so it adds NO
    // SSRF surface (unlike asset-file harvesting). Fail-open; skipped on an auth wall.
    if (!noProductShots) {
      try {
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await waitForStable(page, { timeoutMs: 4000 }); // responsive reflow + lazy content
        await clearOverlays(page);                       // mobile consent/menus differ from desktop
        const mp = path.join(workDir, "website_mobile.png");
        const cap = await captureViewport(page, { outPath: mp, isAuthWall });
        record(cap, "mobile", "");
      } catch (e) { console.warn(`[ingest] mobile screenshot failed: ${e.message}`); }
    }

    // The path list stays a plain string[] for every existing consumer; `shots`
    // carries the quality metadata the intake gate now needs. On an auth wall the
    // captures exist (for colours) but are never offered as product visuals.
    const usableShots = noProductShots ? [] : shots;
    const screenshotPaths = usableShots.map((s) => s.path);
    const obstructed = shots.filter((s) => !s.clean).length;

    console.log(`[ingest] website understood: "${data.title}" — ${data.headings.length} headings, ${data.bodyText.length}ch body, ${screenshotPaths.length} usable screenshot(s)${obstructed ? ` (${obstructed} still obstructed)` : ""}${isAuthWall ? " (auth wall — screenshots suppressed)" : ""}${isDeadPage ? " (dead page — screenshots suppressed)" : ""}, colors=${brandColors.join(",") || "none"}`);
    return { url, ...data, isAuthWall, isDeadPage, brandColors, screenshotPath, screenshotPaths, shots: usableShots, assets, harvestReview, brandSignals };
  } finally {
    await browser.close().catch(() => {});
  }
}

// dominantColors is ffmpeg-only and takes ANY image path — exported so the intake
// can quantize an uploaded LOGO's brand colors with the same quantizer used on the
// website hero (no native image dep, no second implementation).
module.exports = { understandWebsite, findChrome, dominantColors };
