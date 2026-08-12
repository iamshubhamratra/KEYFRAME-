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

// Locate a usable Chromium. Mirrors runtime_check.findChromium so the gate uses
// the same browser the renderer downloaded — no extra install.
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
    // CLIPPED OUT by an ancestor's overflow. An odometer digit roll is a column
    // of 0-9 inside a masked window: every digit but one is scrolled out of view,
    // yet each still reports a bounding box and still has a text node. Measuring
    // them samples the digit that IS visible (same colour) as their backdrop and
    // reports 1:1 on a roll that reads perfectly.
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body && !clipped; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (!/hidden|clip|auto|scroll/.test(ps.overflow + ps.overflowX + ps.overflowY)) continue;
      const pr = p.getBoundingClientRect();
      const ix = Math.min(r.right, pr.right) - Math.max(r.left, pr.left);
      const iy = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top);
      // Needs most of the glyph inside the window to count as shown.
      if (ix <= 0 || iy <= 0 || (ix * iy) / (r.width * r.height) < 0.6) clipped = true;
    }
    if (clipped) continue;
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
    // Whether the GLYPH is painted by its background (gradient-clip / invisible
    // fill) is decided by the FILL alpha — NOT a `color` fallback. Emphasis CSS
    // routinely sets `-webkit-text-fill-color:transparent` alongside a solid
    // `color:` fallback; keying off `color` would wrongly treat gradient text as
    // solid, skip the background-strip, and sample the gradient as its own backdrop.
    const transparentFill = fill[3] <= 0.1;
    const declared = transparentFill ? color : fill;
    el.setAttribute("data-cc", String(i));
    // Gradient-clipped text paints its glyphs FROM its background, so hiding it
    // means removing that background. Solid text keeps its own background (a pill
    // button's gradient fill IS the backdrop we must measure against), so only
    // gradient-fill elements get the extra background-stripping rule.
    if (transparentFill) el.setAttribute("data-cc-grad", "1");
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
      transparentFill, // glyph painted by its background (gradient-clip / invisible fill)
    });
    i++;
  }
  return boxes;
}

// Hide the glyphs of the tagged text (both plain color text AND gradient-clipped
// text) while KEEPING element box backgrounds — so the backdrop screenshot shows
// what actually sits behind each glyph. Returns nothing.
function hideTaggedGlyphs() {
  // Apply the hide as INLINE !important styles (the strongest level of the
  // cascade) rather than a <style> rule — packs style emphasis via `#id .kfacc`
  // (higher specificity) and keep `-webkit-background-clip:text`, which a plain
  // stylesheet rule doesn't reliably neutralize. Save each element's original
  // inline style so unhide restores it exactly (buttons/badges keep their fill).
  for (const el of document.querySelectorAll("[data-cc]")) {
    el.setAttribute("data-cc-style", el.getAttribute("style") || "");
    el.style.setProperty("color", "transparent", "important");
    el.style.setProperty("-webkit-text-fill-color", "transparent", "important");
    el.style.setProperty("text-shadow", "none", "important");
    el.style.setProperty("caret-color", "transparent", "important");
    // Gradient-clipped text is painted BY its own background — remove it AND
    // un-clip, so the glyph truly disappears in the backdrop frame.
    if (el.hasAttribute("data-cc-grad")) {
      el.style.setProperty("background-image", "none", "important");
      el.style.setProperty("background", "none", "important");
      el.style.setProperty("-webkit-background-clip", "border-box", "important");
      el.style.setProperty("background-clip", "border-box", "important");
    }
  }
}

function unhideTaggedGlyphs() {
  for (const el of document.querySelectorAll("[data-cc]")) {
    const s = el.getAttribute("data-cc-style");
    if (s !== null) {
      if (s) el.setAttribute("style", s); else el.removeAttribute("style");
      el.removeAttribute("data-cc-style");
    }
    el.removeAttribute("data-cc");
    el.removeAttribute("data-cc-grad");
  }
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
      const nearFg = [];
      const idx = [];
      for (let k = 0; k < n; k++) {
        if (dist2(aPx[k], box.fg) >= NEAR_DIST2) continue;
        nearFg.push(k);
        // …and the pixel must actually BE a glyph. Frame B only makes TEXT
        // transparent — borders, rules and backgrounds stay painted. So an
        // element whose own furniture is drawn in the text colour (a monogram
        // disc with a same-colour ring, a numbered badge, an underline) had that
        // furniture counted as "glyph", and because it is identical in both
        // frames it then became its own backdrop: measured 1.28:1 on a monogram
        // that is plainly legible, across nine packs. A real glyph pixel CHANGES
        // when the text is hidden.
        if (dist2(aPx[k], bPx[k]) <= INK_DIST2) continue;
        idx.push(k);
      }
      if (idx.length / n < 0.003 || idx.length < 4) {
        // Nothing changed when the text was hidden. Two very different causes:
        //   - the text is COVERED by an opaque layer → not this element's problem,
        //     and the box will hold few pixels matching the declared fill; skip.
        //   - the text is the SAME COLOUR as what it sits on → the box is full of
        //     fill-coloured pixels that never change. That is unreadable text and
        //     must still fail, or this guard would hide the worst case of all.
        // The discriminator is whether ANYTHING in the box changed when the text
        // was hidden — not whether fill-coloured pixels exist. Fill-coloured
        // decoration is common (a light beam crossing a white line, a ring in the
        // ink colour) and firing on that reported 1:1 for a line I had verified
        // by screenshot as perfectly legible. If nothing anywhere changed, the
        // text truly is not being painted against its surroundings.
        let changedAny = 0;
        for (let k = 0; k < n; k++) if (dist2(aPx[k], bPx[k]) > INK_DIST2) { changedAny++; if (changedAny >= 4) break; }
        if (changedAny < 4 && nearFg.length / n >= 0.02) {
          const flat = medianRGB(nearFg.map((k) => bPx[k]));
          results.push({
            selector: box.selector, text: box.text, ratio: 1,
            needed: box.large ? 3 : 4.5, large: box.large, pass: false,
            fg: [Math.round(box.fg[0]), Math.round(box.fg[1]), Math.round(box.fg[2])],
            bg: [Math.round(flat[0]), Math.round(flat[1]), Math.round(flat[2])],
            transparentFill: !!box.transparentFill,
          });
        }
        continue;
      }
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
      // Rendered foreground + local backdrop (rounded ints) and whether the glyph
      // is gradient-clipped. The deterministic contrast fixer reads these to pick a
      // readable on-palette color and predict the post-fix ratio with THIS exact
      // WCAG math — so a fix it accepts is the same fix this checker will pass.
      fg: [Math.round(fg[0]), Math.round(fg[1]), Math.round(fg[2])],
      bg: [Math.round(bg[0]), Math.round(bg[1]), Math.round(bg[2])],
      transparentFill: !!box.transparentFill,
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
    // WAIT FOR A *LIVE* ROOT. The bundled-template packs (omelette_adapter) mount
    // React AFTER load: the bundler wipes <body> — taking the static composition
    // contract with it — and boot() rebuilds the real root a moment later. Reading
    // on `load` therefore lands in the window where NEITHER exists, so this
    // returned "no composition root" and the ENTIRE deterministic fix chain
    // (contrast + layout + identity + background) was a silent no-op on every one
    // of those packs. Measured: every omelette film shipped with contrast
    // "checked: false" while QA reported blockers nothing had tried to fix.
    // A zero-height root means the film has not painted yet, so require a real box.
    await page.waitForFunction(() => {
      const r = document.querySelector("[data-composition-id]");
      return !!(r && r.clientHeight > 0 && r.clientWidth > 0);
    }, { timeout: Math.min(20000, Math.max(1, deadline - Date.now())), polling: 200 }).catch(() => { /* fall through to the skip below */ });
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
        all.push({ time: t, selector: e.selector, text: e.text, ratio: e.ratio, needed: e.needed, pass: e.pass, fg: e.fg, bg: e.bg, transparentFill: e.transparentFill });
        if (!e.pass) failures.push({ time: t, selector: e.selector, text: e.text, ratio: e.ratio, needed: e.needed });
      }
    }
    // Persistent failures = text that NEVER clears AA at any settled moment it was
    // measured. A word that dips below during its entrance but reads fine once
    // arrived is legible — only text that's unreadable at its BEST moment is a real
    // finding. This is the verdict the gate reports on; `failures`/`all` stay raw.
    const best = new Map(); // key(selector||text) -> { selector, text, needed, bestRatio, bestTime, bestFg, bestBg, transparentFill }
    for (const e of all) {
      const k = `${e.selector}||${e.text}`;
      const cur = best.get(k);
      // Carry the fg/bg measured at the element's BEST (highest-ratio) settled
      // moment — the fixer targets that frame's colors so its predicted post-fix
      // ratio lines up with what persistentFailures reports here.
      if (!cur || e.ratio > cur.bestRatio) best.set(k, { selector: e.selector, text: e.text, needed: e.needed, bestRatio: e.ratio, bestTime: e.time, bestFg: e.fg, bestBg: e.bg, transparentFill: e.transparentFill });
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

module.exports = { contrastCheck, findChromium, serveDir };
