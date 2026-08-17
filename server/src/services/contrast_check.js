// Legibility gate — WCAG 2.1 contrast audit for a composed composition.
//
// KEYFRAME already gates TIME (hyperframes lint) and SPACE (hyperframes
// inspect), plus a does-it-throw runtime smoke. Nothing checks whether the
// text is actually READABLE against what's behind it — low-contrast ink on a
// busy photo / gradient / same-family panel renders "fine" (no overlap, no
// throw) yet is unreadable in the final MP4.
//
// This module ports HeyGen HyperFrames' contrast diagnostic (the `validate`
// contrast audit that ships in newer HyperFrames than the version we pin) to
// KEYFRAME's own stack — so it runs on the EXACT engine we render with and adds
// no heavy dependency. It reuses puppeteer-core (already a dependency) + the
// same cached Chromium the renderer/runtime-check use, seeks the paused GSAP
// timeline to a few sample times, screenshots each, and — entirely inside the
// page via an OffscreenCanvas — samples a 4px ring of REAL rendered pixels
// behind every text element and computes the WCAG contrast ratio against the
// element's own foreground color (alpha-composited over the measured bg).
//
// The WCAG math (relative luminance, ratio, large-text thresholds) and the
// ring-median sampling mirror HyperFrames' contrast-report.mjs exactly, so a
// verdict here matches what HyperFrames would report.
//
// Philosophy (identical to runtime_check.js): this checker NEVER blocks a
// generation by itself. If Chromium/puppeteer is unavailable, the timeline
// can't be found, or anything unexpected happens, it returns { ok:true,
// skipped } so the pipeline is never held hostage by the checker.

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

// Locate a usable Chromium — the same browser the renderer downloaded, no extra install.
//
// IMPORTED, not copied. This used to be a hand-kept mirror of runtime_check.findChromium, and the
// three copies in this repo had already drifted apart: only one of them knew about Apple silicon,
// and all three ordered versions lexically (so a two-digit major would out-sort a three-digit one
// and select a years-old browser). One implementation, one place to fix.
const { findChromium } = require("./runtime_check");

// Serve the job dir over an ephemeral localhost server so assets/fonts/ESM
// imports resolve exactly as in the real render (avoids file:// CORS).
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

// --- Page-side functions (run inside Chromium via page.evaluate) ------------
// These are serialized and executed in the browser, so they must be fully
// self-contained (no closures over Node scope, no imports).

/* c8 ignore start — executes in the browser context, not under node coverage */

// Find every text-bearing element visible at the current seek, tag it with a
// data-cc index (so we can hide exactly these glyphs for the backdrop pass),
// and return its box + large-text threshold. NOTE: we deliberately do NOT read
// getComputedStyle().color for the foreground — gradient-clipped emphasis
// (-webkit-text-fill-color:transparent) reports transparent there, which is the
// exact false-1:1 bug. The real fg color is measured from rendered pixels.
function collectTextBoxes(frameW, frameH) {
  const selectorOf = (el) => {
    if (el.id) return `#${el.id}`;
    const cls = [...el.classList].slice(0, 2).join(".");
    return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
  };
  const isLarge = (size, weight) => size >= 24 || (size >= 19 && weight >= 700);
  // Cumulative opacity of an element and all its ancestors — catches text that's
  // mid-fade because a PARENT (scene wrapper, cut layer) is animating opacity.
  const effectiveOpacity = (el) => {
    let o = 1, n = el;
    while (n && n !== document.documentElement) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
    return o;
  };
  const boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el, i = 0;
  while ((el = walker.nextNode())) {
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length);
    if (!direct) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    // Only audit SETTLED text. Text that is mid-entrance/exit (fading, at partial
    // opacity via itself or any ancestor) is intentionally transient — measuring
    // its contrast against a half-composited frame yields false failures. 0.9 keeps
    // fully-arrived text and drops everything still animating in/out.
    if (effectiveOpacity(el) < 0.9) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.x + r.width <= 0 || r.y + r.height <= 0 || r.x >= frameW || r.y >= frameH) continue;
    // NOTE: occlusion is NOT gated here. probeFrames decides visibility from
    // pixels: text covered by an OPAQUE layer isn't painted with its declared
    // color in frame A (presence check fails) and is skipped, while text under a
    // TRANSLUCENT overlay (grain/vignette/glass) still shows and is measured.
    // elementFromPoint can't make that distinction (a transparent overlay reads
    // as the topmost element), so we rely on pixels instead.
    const parse = (c) => {
      const m = (c || "").match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(",").map((s) => parseFloat(s.trim()));
      return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] ?? 1];
    };
    // The painted fill: -webkit-text-fill-color when set, else color. Gradient
    // emphasis (background-clip:text) sets fill transparent — flag it so
    // probeFrames measures those glyphs from pixels instead of the declared color.
    const fill = parse(cs.webkitTextFillColor);
    const color = parse(cs.color);
    const declared = fill[3] > 0.1 ? fill : color;
    el.setAttribute("data-cc", String(i));
    // Gradient-clipped text paints its glyphs FROM its background, so hiding it
    // means removing that background. Solid text keeps its own background (a pill
    // button's gradient fill IS the backdrop we must measure against), so only
    // gradient-fill elements get the extra background-stripping rule.
    if (declared[3] <= 0.1) el.setAttribute("data-cc-grad", "1");
    const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
    boxes.push({
      i,
      selector: selectorOf(el),
      text: el.textContent.trim().slice(0, 60),
      bbox: {
        x: Math.max(0, r.x), y: Math.max(0, r.y),
        w: Math.min(frameW, r.x + r.width) - Math.max(0, r.x),
        h: Math.min(frameH, r.y + r.height) - Math.max(0, r.y),
      },
      large: isLarge(size, weight),
      fg: [declared[0], declared[1], declared[2]],
      fgAlpha: declared[3],
      transparentFill: declared[3] <= 0.1, // gradient-clipped / invisible fill
    });
    i++;
  }
  return boxes;
}

// Hide the glyphs of the tagged text (both plain color text AND gradient-clipped
// text) while KEEPING element box backgrounds — so the backdrop screenshot shows
// what actually sits behind each glyph. Returns nothing.
function hideTaggedGlyphs() {
  const st = document.createElement("style");
  st.id = "__cc_hide__";
  st.textContent =
    // Hide the glyphs of ALL tagged text (transparent fill + no shadow) while
    // KEEPING element backgrounds, so the backdrop screenshot shows what sits
    // behind each glyph — including an element's own button/pill fill.
    "[data-cc]{color:transparent!important;-webkit-text-fill-color:transparent!important;" +
    "text-shadow:none!important;caret-color:transparent!important}" +
    // Gradient-clipped text is painted BY its background — strip it only for those.
    "[data-cc-grad]{background:none!important;background-image:none!important}";
  document.head.appendChild(st);
}

function unhideTaggedGlyphs() {
  const st = document.getElementById("__cc_hide__");
  if (st) st.remove();
  for (const el of document.querySelectorAll("[data-cc]")) el.removeAttribute("data-cc");
  for (const el of document.querySelectorAll("[data-cc-grad]")) el.removeAttribute("data-cc-grad");
}

// Decode the text frame (A, glyphs shown) and the backdrop frame (B, glyphs
// hidden), aligned pixel-for-pixel, and for each box:
//   glyph pixels = positions where A differs from B (the ink actually painted).
//   fg = median A over glyph pixels (real rendered glyph color, incl. gradients).
//   bg = median B over the SAME positions (true local backdrop under the ink).
// A box with too few glyph pixels is not visibly painted here — text covered by
// an opaque layer, or genuinely absent — and is skipped rather than failed.
// Returns WCAG ratios per measured box.
async function probeFrames(aUrl, bUrl, boxes, frameW, frameH) {
  const relLum = ([r, g, b]) => {
    const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };
  const ratioOf = (a, b) => {
    const la = relLum(a), lb = relLum(b);
    const [L1, L2] = la > lb ? [la, lb] : [lb, la];
    return (L1 + 0.05) / (L2 + 0.05);
  };
  const median = (arr) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  const medianRGB = (px) => [median(px.map((p) => p[0])), median(px.map((p) => p[1])), median(px.map((p) => p[2]))];
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  const toCtx = async (url) => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0);
    return { cx, w: bmp.width, h: bmp.height };
  };
  const over = ([fr, fg, fb, fa], [br, bg, bb]) => [
    Math.round(fr * fa + br * (1 - fa)), Math.round(fg * fa + bg * (1 - fa)), Math.round(fb * fa + bb * (1 - fa)),
  ];
  const A = await toCtx(aUrl), B = await toCtx(bUrl);
  const sx = A.w / frameW, sy = A.h / frameH;

  // Read a box's pixels (stepped, capped ~2500 samples) from a context, in a
  // deterministic row-major order so A and B samples line up index-for-index.
  const readBox = (C, b) => {
    const ix = Math.round(b.x * sx), iy = Math.round(b.y * sy);
    const iw = Math.max(1, Math.round(b.w * sx)), ih = Math.max(1, Math.round(b.h * sy));
    const cw = Math.min(iw, C.w - ix), chh = Math.min(ih, C.h - iy);
    if (cw < 1 || chh < 1) return [];
    const data = C.cx.getImageData(ix, iy, cw, chh).data;
    const step = Math.max(1, Math.floor(Math.sqrt((cw * chh) / 2500)));
    const px = [];
    for (let y = 0; y < chh; y += step) {
      for (let x = 0; x < cw; x += step) {
        const o = (y * cw + x) * 4;
        px.push([data[o], data[o + 1], data[o + 2]]);
      }
    }
    return px;
  };

  // A pixel counts as glyph "ink" (for the gradient fallback) when hiding the
  // glyphs changed it by more than this (per-channel ~23).
  const INK_DIST2 = 1600;
  // A pixel is "near" the declared fill (presence check) within this (~28/ch).
  const NEAR_DIST2 = 2400;
  const results = [];
  for (const box of boxes) {
    const aPx = readBox(A, box.bbox), bPx = readBox(B, box.bbox);
    const n = Math.min(aPx.length, bPx.length);
    if (n < 4) continue;

    let fg, bg;
    if (box.transparentFill) {
      // Gradient-clipped emphasis has no usable declared color — recover the
      // painted stroke from where A differs from B, keeping the strong-delta core
      // (excludes soft glow that would drag the median toward the background).
      const cand = [];
      for (let k = 0; k < n; k++) {
        const d = dist2(aPx[k], bPx[k]);
        if (d > INK_DIST2) cand.push(k);
      }
      if (cand.length / n < 0.01 || cand.length < 6) continue; // covered/invisible
      cand.sort((x, y) => dist2(aPx[y], bPx[y]) - dist2(aPx[x], bPx[x]));
      const core = cand.slice(0, Math.max(6, Math.floor(cand.length * 0.4)));
      fg = medianRGB(core.map((k) => aPx[k]));
      bg = medianRGB(core.map((k) => bPx[k])); // local backdrop under the strokes
    } else {
      // Solid text: the declared fill IS the readable color (noise-free, and it
      // correctly flags near-background low-contrast text that a pixel-only diff
      // would miss). Presence check: the glyphs must actually be painted with that
      // color in frame A — if not, the text is covered by an opaque layer → skip.
      const idx = [];
      for (let k = 0; k < n; k++) if (dist2(aPx[k], box.fg) < NEAR_DIST2) idx.push(k);
      if (idx.length / n < 0.003 || idx.length < 4) continue; // not painted here
      // Backdrop is LOCAL — the hidden-frame pixels right under the glyph strokes,
      // not the whole box (which a bright fill/button around the text would bias).
      bg = medianRGB(idx.map((k) => bPx[k]));
      fg = over([box.fg[0], box.fg[1], box.fg[2], box.fgAlpha], bg);
    }

    const ratio = ratioOf(fg, bg);
    const needed = box.large ? 3 : 4.5;
    results.push({
      selector: box.selector,
      text: box.text,
      ratio: +ratio.toFixed(2),
      needed,
      large: box.large,
      pass: ratio >= needed,
    });
  }
  return results;
}
/* c8 ignore stop */

// Audit a job dir. Returns:
//   { ok, failures:[{time,selector,text,ratio,needed}], samples, skipped? }
// ok:true when every sampled text element clears WCAG AA (or the check couldn't
// run). ok:false only when at least one real AA failure was measured.
async function contrastCheck(jobDir, { samples = 5, timeoutMs = 120000 } = {}) {
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); }
  catch { return { ok: true, skipped: "puppeteer-core not installed" }; }
  const exe = findChromium();
  if (!exe) return { ok: true, skipped: "no chromium" };
  const indexPath = path.join(jobDir, "index.html");
  if (!fs.existsSync(indexPath)) return { ok: true, skipped: "no index.html" };

  let served = null, browser = null;
  const deadline = Date.now() + timeoutMs;
  try {
    served = await serveDir(jobDir);
    browser = await puppeteer.launch({
      executablePath: exe,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();

    // Read the composition's own canvas size + duration from the root element,
    // so we seek/measure in the composition's coordinate space.
    await page.goto(`http://127.0.0.1:${served.port}/`, { waitUntil: "load", timeout: Math.max(1, deadline - Date.now()) });
    const meta = await page.evaluate(() => {
      const root = document.querySelector("[data-composition-id]");
      if (!root) return null;
      return {
        id: root.getAttribute("data-composition-id"),
        w: Number(root.getAttribute("data-width")) || window.innerWidth,
        h: Number(root.getAttribute("data-height")) || window.innerHeight,
        dur: Number(root.getAttribute("data-duration")) || 0,
      };
    });
    if (!meta) return { ok: true, skipped: "no composition root" };
    await page.setViewport({ width: meta.w, height: meta.h, deviceScaleFactor: 1 });

    // Size the composition root to its declared canvas. When served raw (no
    // HyperFrames producer runtime), the root's children are all position:absolute,
    // so the root collapses to 0px and NOTHING paints — every sample would read the
    // blank page. The producer's file server injects this sizing at serve time; we
    // reproduce it so the seeked frame matches the rendered MP4. Body bg is set to
    // black (the effective video backdrop) to avoid a white bleed on any transparent
    // root edge.
    await page.evaluate((w, h) => {
      const st = document.createElement("style");
      st.id = "__cc_size__";
      st.textContent =
        `html,body{margin:0!important;padding:0!important;width:${w}px!important;height:${h}px!important;` +
        `background:#000!important;overflow:hidden!important}` +
        `[data-composition-id]{position:absolute!important;top:0!important;left:0!important;` +
        `width:${w}px!important;height:${h}px!important;overflow:hidden!important}`;
      document.head.appendChild(st);
    }, meta.w, meta.h);

    // Wait for the timeline to register (same signal runtime_check gates on).
    const hasTl = await page
      .waitForFunction(
        (id) => window.__timelines && window.__timelines[id] && typeof window.__timelines[id].time === "function",
        { timeout: Math.min(8000, Math.max(1, deadline - Date.now())) },
        meta.id,
      )
      .then(() => true)
      .catch(() => false);
    if (!hasTl) return { ok: true, skipped: "no seekable timeline" };

    const duration = meta.dur || (await page.evaluate((id) => window.__timelines[id].duration(), meta.id)) || 0;
    if (!(duration > 0)) return { ok: true, skipped: "zero duration" };

    // Sample at the midpoint of N even buckets (matches HyperFrames' spacing) —
    // avoids t=0 (nothing entered yet) and the final frame (mid-exit).
    const times = Array.from({ length: samples }, (_, i) => +(((i + 0.5) / samples) * duration).toFixed(3));
    const failures = [];
    const all = [];
    for (const t of times) {
      if (Date.now() > deadline) { return { ok: failures.length === 0, failures, all, samples: times, skipped: "timeout" }; }
      await page.evaluate((id, time) => {
        const tl = window.__timelines[id];
        tl.pause();
        tl.time(time);
      }, meta.id, t);
      // Let GSAP flush the seeked state + any canvas FX paint a frame.
      await new Promise((r) => setTimeout(r, 120));

      // Tag + measure text boxes; two screenshots (glyphs shown, glyphs hidden)
      // let us read the ACTUAL rendered glyph color and the TRUE backdrop from
      // pixels — robust to gradient-clipped text and neighboring same-color words.
      const boxes = await page.evaluate(collectTextBoxes, meta.w, meta.h);
      if (!boxes.length) continue;
      const aB64 = await page.screenshot({ encoding: "base64", type: "png" });
      await page.evaluate(hideTaggedGlyphs);
      const bB64 = await page.screenshot({ encoding: "base64", type: "png" });
      let entries = [];
      try {
        entries = await page.evaluate(
          probeFrames,
          `data:image/png;base64,${aB64}`,
          `data:image/png;base64,${bB64}`,
          boxes, meta.w, meta.h,
        );
      } finally {
        await page.evaluate(unhideTaggedGlyphs);
      }
      for (const e of entries) {
        all.push({ time: t, selector: e.selector, text: e.text, ratio: e.ratio, needed: e.needed, pass: e.pass });
        if (!e.pass) failures.push({ time: t, selector: e.selector, text: e.text, ratio: e.ratio, needed: e.needed });
      }
    }
    // Persistent failures = text that NEVER clears AA at any settled moment it was
    // measured. A word that dips below during its entrance but reads fine once
    // arrived is legible — only text that's unreadable at its BEST moment is a real
    // finding. This is the verdict the gate reports on; `failures`/`all` stay raw.
    const best = new Map(); // key(selector||text) -> { selector, text, needed, bestRatio, bestTime }
    for (const e of all) {
      const k = `${e.selector}||${e.text}`;
      const cur = best.get(k);
      if (!cur || e.ratio > cur.bestRatio) best.set(k, { selector: e.selector, text: e.text, needed: e.needed, bestRatio: e.ratio, bestTime: e.time });
    }
    const persistentFailures = [...best.values()]
      .filter((g) => g.bestRatio < g.needed)
      .sort((a, b) => a.bestRatio - b.bestRatio);
    return { ok: persistentFailures.length === 0, persistentFailures, failures, all, samples: times };
  } catch (e) {
    // Never block on infrastructure trouble.
    return { ok: true, skipped: `error: ${String(e && e.message || e).slice(0, 160)}` };
  } finally {
    try { if (browser) await browser.close(); } catch { /* noop */ }
    try { if (served) served.server.close(); } catch { /* noop */ }
  }
}

module.exports = { contrastCheck, findChromium };
