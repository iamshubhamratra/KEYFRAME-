// Deterministic LAYOUT fixer — the "space" sibling of contrast_fix (color) and
// identity_fix (palette). The post-render QA vision agent kept flagging two
// defect classes the color fixer can't touch:
//   • a DUPLICATE line rendered twice (redundant subtitle), and
//   • text COLLIDING with a graphic/screenshot (readable color, but sitting on a
//     busy image so it can't be read).
// Both are SPATIAL, not color. This renders the composed comp in Chromium (reusing
// contrast_check's server + Chromium), samples settled frames, and for each frame:
//   • groups visible text by content → hides the redundant copies (keeps one),
//   • flags text whose box sits on top of an image/graphic with no solid backing
//     → drops a solid scrim chip behind it so it reads.
// Per the approved decision it is SAFE-ONLY: it hides or scrims, it NEVER moves a
// GSAP-animated element (a nudge can break an entrance). Pure post-hoc HTML edits
// (reusing contrast_fix's element locator + inline-style writer). Fail-open.

const fs = require("node:fs");
const path = require("node:path");
const { findChromium, serveDir } = require("./contrast_check");
const { locate, withDecls } = require("./contrast_fix");

// A colliding text element gets a solid dark chip + white text — universally
// legible over any graphic, and the "safe scrim" the user chose over repositioning.
function collisionScrimDecls() {
  return [
    "background-color:rgba(15,16,20,0.82) !important",
    "background-image:none !important",
    "-webkit-background-clip:border-box !important",
    "background-clip:border-box !important",
    "color:#FFFFFF !important",
    "-webkit-text-fill-color:#FFFFFF !important",
    "padding:0.06em 0.34em",
    "border-radius:0.16em",
    "box-decoration-break:clone",
    "-webkit-box-decoration-break:clone",
  ];
}
const HIDE_DECLS = ["visibility:hidden !important"];

// Fraction of the TEXT box that sits over the graphic box.
function overlapFrac(t, g) {
  const ix = Math.max(0, Math.min(t.x + t.w, g.x + g.w) - Math.max(t.x, g.x));
  const iy = Math.max(0, Math.min(t.y + t.h, g.y + g.h) - Math.max(t.y, g.y));
  const inter = ix * iy;
  const area = t.w * t.h;
  return area > 0 ? inter / area : 0;
}

/* c8 ignore start — runs inside Chromium */
// Collect visible content boxes at the current seek: text elements (with their
// normalized text) and graphic elements (img/video/canvas/svg or a raster
// background-image). Mirrors contrast_check's selectorOf + settled-opacity gate.
function collectContentBoxes(frameW, frameH) {
  const selectorOf = (el) => {
    if (el.id) return `#${el.id}`;
    const cls = [...el.classList].slice(0, 2).join(".");
    return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
  };
  const effectiveOpacity = (el) => {
    let o = 1, n = el;
    while (n && n !== document.documentElement) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
    return o;
  };
  const boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = walker.nextNode())) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (effectiveOpacity(el) < 0.9) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.x + r.width <= 0 || r.y + r.height <= 0 || r.x >= frameW || r.y >= frameH) continue;
    const bbox = {
      x: Math.max(0, r.x), y: Math.max(0, r.y),
      w: Math.min(frameW, r.x + r.width) - Math.max(0, r.x),
      h: Math.min(frameH, r.y + r.height) - Math.max(0, r.y),
    };
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length);
    const tag = el.tagName;
    const bg = cs.backgroundImage || "";
    // A collision "obstacle" is a real CONTENT image/video (a raster photo,
    // screenshot, or url()-backed tile) — NOT a decorative full-bleed layer. We
    // deliberately EXCLUDE <canvas>/<svg> (particle fields, decorative vector art)
    // and gradients: scene-kit intentionally layers text over those, so counting
    // them as collisions scrimmed every headline. Full-bleed size is filtered later.
    const isGraphic = /^(IMG|VIDEO)$/.test(tag) || bg.includes("url(");
    const kind = direct ? "text" : (isGraphic ? "graphic" : null);
    if (!kind) continue;
    const bc = cs.backgroundColor || "";
    const m = bc.match(/rgba?\(([^)]+)\)/);
    let alpha = 0;
    if (m) { const p = m[1].split(",").map((s) => parseFloat(s)); alpha = p.length === 4 ? (p[3] || 0) : 1; }
    const text = direct ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    boxes.push({
      selector: selectorOf(el),
      kind,
      text,
      normText: text.toLowerCase(),
      bbox,
      areaFrac: (bbox.w * bbox.h) / (frameW * frameH),
      hasSolidBg: alpha >= 0.5,
    });
  }
  return boxes;
}
/* c8 ignore stop */

// Render the comp and collect boxes at N settled sample times.
async function layoutProbe(jobDir, { samples = 4, timeoutMs = 45000 } = {}) {
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); } catch { return { skipped: "puppeteer-core not installed" }; }
  const exe = findChromium();
  if (!exe) return { skipped: "no chromium" };
  if (!fs.existsSync(path.join(jobDir, "index.html"))) return { skipped: "no index.html" };

  let served = null, browser = null;
  const deadline = Date.now() + timeoutMs;
  try {
    served = await serveDir(jobDir);
    browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${served.port}/`, { waitUntil: "load", timeout: Math.max(1, deadline - Date.now()) });
    const meta = await page.evaluate(() => {
      const root = document.querySelector("[data-composition-id]");
      if (!root) return null;
      return { id: root.getAttribute("data-composition-id"), w: Number(root.getAttribute("data-width")) || window.innerWidth, h: Number(root.getAttribute("data-height")) || window.innerHeight, dur: Number(root.getAttribute("data-duration")) || 0 };
    });
    if (!meta) return { skipped: "no composition root" };
    await page.setViewport({ width: meta.w, height: meta.h, deviceScaleFactor: 1 });
    await page.evaluate((w, h) => {
      const st = document.createElement("style");
      st.textContent = `html,body{margin:0!important;padding:0!important;width:${w}px!important;height:${h}px!important;background:#000!important;overflow:hidden!important}[data-composition-id]{position:absolute!important;top:0!important;left:0!important;width:${w}px!important;height:${h}px!important;overflow:hidden!important}`;
      document.head.appendChild(st);
    }, meta.w, meta.h);
    const hasTl = await page.waitForFunction((id) => window.__timelines && window.__timelines[id] && typeof window.__timelines[id].time === "function", { timeout: Math.min(8000, Math.max(1, deadline - Date.now())) }, meta.id).then(() => true).catch(() => false);
    if (!hasTl) return { skipped: "no seekable timeline" };
    const duration = meta.dur || (await page.evaluate((id) => window.__timelines[id].duration(), meta.id)) || 0;
    if (!(duration > 0)) return { skipped: "zero duration" };

    const times = Array.from({ length: samples }, (_, i) => +(((i + 0.5) / samples) * duration).toFixed(3));
    const frames = [];
    for (const t of times) {
      if (Date.now() > deadline) break;
      await page.evaluate((id, time) => { const tl = window.__timelines[id]; tl.pause(); tl.time(time); }, meta.id, t);
      await new Promise((r) => setTimeout(r, 100));
      const boxes = await page.evaluate(collectContentBoxes, meta.w, meta.h);
      frames.push({ t, boxes });
    }
    return { frames };
  } catch (e) {
    return { skipped: `error: ${String(e && e.message || e).slice(0, 160)}` };
  } finally {
    try { if (browser) await browser.close(); } catch { /* noop */ }
    try { if (served) served.server.close(); } catch { /* noop */ }
  }
}

// Node-side analysis of the sampled frames.
function analyze(frames) {
  const dupMap = new Map(); // selector||text -> { selector, text, mode }
  const colMap = new Map(); // selector||text -> { selector, text }
  for (const { boxes } of frames || []) {
    const texts = boxes.filter((b) => b.kind === "text" && b.text.length >= 4);
    // Obstacles are CONTENT images only: between 2% and 60% of the frame. Below 2%
    // is an icon/decoration; above 60% is a full-bleed background/hero the design
    // intentionally sets text on — neither is a "collision".
    const graphics = boxes.filter((b) => b.kind === "graphic" && b.areaFrac >= 0.02 && b.areaFrac <= 0.6);

    // duplicates within this frame: same normalized text on 2+ distinct elements
    const groups = new Map();
    for (const t of texts) { if (!groups.has(t.normText)) groups.set(t.normText, []); groups.get(t.normText).push(t); }
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => (b.bbox.w * b.bbox.h) - (a.bbox.w * a.bbox.h)); // keep the largest/most-prominent
      const keeper = arr[0];
      for (const el of arr.slice(1)) {
        const key = `${el.selector}||${el.text}`;
        // identical sibling of the keeper → hide one copy; distinct element → hide all with that selector
        dupMap.set(key, { selector: el.selector, text: el.text, mode: el.selector === keeper.selector ? "keepOne" : "all" });
      }
    }

    // collisions: a text box sitting on top of a graphic with no solid backing
    for (const t of texts) {
      if (t.hasSolidBg) continue;
      for (const g of graphics) {
        if (g.selector === t.selector) continue;
        if (overlapFrac(t.bbox, g.bbox) > 0.55) { colMap.set(`${t.selector}||${t.text}`, { selector: t.selector, text: t.text }); break; }
      }
    }
  }
  // never scrim a duplicate we're already hiding
  for (const k of dupMap.keys()) colMap.delete(k);
  return { duplicates: [...dupMap.values()], collisions: [...colMap.values()] };
}

// Hide element(s) matching (selector,text). keepOne=true keeps the first
// occurrence of an identical repeated tag (hides 2..N); false hides them all.
function hideText(html, selector, text, keepOne) {
  const hits = locate(html, selector, text);
  if (!hits.length) return { html, hidden: 0 };
  if (!keepOne) {
    let hidden = 0; const done = new Set();
    for (const h of hits) {
      if (done.has(h.openTag)) continue;
      const nt = withDecls(h.openTag, HIDE_DECLS);
      if (nt !== h.openTag) { hidden += html.split(h.openTag).length - 1; html = html.split(h.openTag).join(nt); done.add(h.openTag); }
    }
    return { html, hidden };
  }
  const openTag = hits[0].openTag;
  const parts = html.split(openTag);
  if (parts.length - 1 < 2) return { html, hidden: 0 }; // only one copy — nothing to dedup
  const nt = withDecls(openTag, HIDE_DECLS);
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) out += (i === 1 ? openTag : nt) + parts[i]; // keep 1st, hide the rest
  return { html: out, hidden: parts.length - 2 };
}

function applyFixes(html, { duplicates, collisions }) {
  const changed = [];
  let duplicatesRemoved = 0, collisionsScrimmed = 0;
  for (const d of duplicates) {
    const res = hideText(html, d.selector, d.text, d.mode === "keepOne");
    if (res.hidden) { html = res.html; duplicatesRemoved += res.hidden; changed.push(`hide-duplicate: ${d.selector} "${d.text.slice(0, 30)}" ×${res.hidden}`); }
  }
  for (const c of collisions) {
    const hits = locate(html, c.selector, c.text);
    let applied = 0; const done = new Set();
    for (const h of hits) {
      if (done.has(h.openTag)) continue;
      const nt = withDecls(h.openTag, collisionScrimDecls());
      if (nt !== h.openTag) { html = html.split(h.openTag).join(nt); done.add(h.openTag); applied++; }
    }
    if (applied) { collisionsScrimmed += applied; changed.push(`scrim-collision: ${c.selector} "${c.text.slice(0, 30)}"`); }
  }
  return { html, changed, duplicatesRemoved, collisionsScrimmed };
}

// Full pass: probe → analyze → apply → write. Returns { changed, duplicatesRemoved,
// collisionsScrimmed, skipped? } and writes the edited index.html in place.
async function layoutFix(jobDir, { samples = 4, timeoutMs = 45000 } = {}) {
  const probe = await layoutProbe(jobDir, { samples, timeoutMs });
  if (probe.skipped) return { skipped: probe.skipped, changed: [], duplicatesRemoved: 0, collisionsScrimmed: 0 };
  const findings = analyze(probe.frames);
  if (!findings.duplicates.length && !findings.collisions.length) return { changed: [], duplicatesRemoved: 0, collisionsScrimmed: 0 };
  const indexPath = path.join(jobDir, "index.html");
  let html;
  try { html = fs.readFileSync(indexPath, "utf8"); } catch { return { changed: [], duplicatesRemoved: 0, collisionsScrimmed: 0 }; }
  const out = applyFixes(html, findings);
  if (out.changed.length) fs.writeFileSync(indexPath, out.html, "utf8");
  return { changed: out.changed, duplicatesRemoved: out.duplicatesRemoved, collisionsScrimmed: out.collisionsScrimmed };
}

module.exports = { layoutFix, analyze, applyFixes, overlapFrac };
