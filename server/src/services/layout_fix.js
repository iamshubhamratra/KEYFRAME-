// Deterministic LAYOUT fixer — the "space" sibling of contrast_fix (color) and
// identity_fix (palette). The post-render QA vision agent kept flagging defect
// classes the color fixer can't touch:
//   • a DUPLICATE line rendered twice (redundant subtitle),
//   • text COLLIDING with a graphic/card/ornament (readable color, but something is
//     painted over it), and
//   • text OVERRUNNING the box it was given, so it is cut or spills onto its
//     neighbour.
// All three are SPATIAL, not color. This renders the composed comp in Chromium (reusing
// contrast_check's server + Chromium), samples settled frames, and for each frame:
//   • groups visible text by content → hides the redundant copies (keeps one),
//   • finds text a solid node is PAINTED OVER → scrims the text, or drops the node
//     when it is a pure ornament,
//   • finds text overrunning its own box → shrinks it to fit.
// Per the approved decision it is SAFE-ONLY: it hides, scrims or shrinks, it NEVER
// moves a GSAP-animated element (a nudge can break an entrance). Pure post-hoc HTML
// edits (reusing contrast_fix's element locator + inline-style writer). Fail-open.
//
// WHY THE COLLISION HALF USED TO RESOLVE NOTHING. Measured over the 14 most recent
// finished jobs, 9 shipped an ELEMENT COLLISION blocker; every one of them carried
// `collisionsScrimmed: 0`. Re-probing four of those films' own comps (launch-pop,
// bluesite, birdsong-field, steam-spring — rebuilt from the same storyboard and
// asset supply) against the old detector found ZERO collisions in 24 sampled
// frames, because an "obstacle" was only ever an <img>/<video>/url()-backed tile:
// of 5178 element samples just 13 qualified, 5 of those were then dropped by the
// area gate, and 1420 non-text nodes were discarded outright — among them 207
// solid cards/rules, 12 gradient panels and 6 canvas/svg layers. Those discarded
// shapes ARE the defect QA describes: "the yellow vertical rule is running through
// the text blocks", "the 'Cited sources' card is overlapping the video inset",
// "the central circular graphic is overlapping the body text". So the pass reported
// changedAny:false, the router read no change, and the verdict shipped unchanged.
//
// An occluder is now anything that paints — media, a gradient panel, or a
// background-color at alpha ≥ 0.35 — and INTENT is settled by asking the browser
// instead of guessing: elementsFromPoint over the intersection gives the real paint
// stack, and the node only counts when it sits ABOVE the text in it. That is what
// makes the pass safe to widen — a scrim behind a headline and a label sitting on a
// card both fail the test by construction, because they are painted underneath.

const fs = require("node:fs");
const path = require("node:path");
const { findChromium, serveDir } = require("./contrast_check");
const { locate, withDecls } = require("./contrast_fix");

// A colliding text element gets a solid dark chip + white text — universally
// legible over any graphic, and the "safe scrim" the user chose over repositioning.
// The chip is painted with a box-shadow spread rather than padding: padding grows
// the element's border box (0.34em a side — 66px on a 97px headline), and a repair
// for overlapping text must not itself push its neighbours into a collision.
function collisionScrimDecls() {
  return [
    "background-color:rgba(15,16,20,0.82) !important",
    "background-image:none !important",
    "-webkit-background-clip:border-box !important",
    "background-clip:border-box !important",
    "color:#FFFFFF !important",
    "-webkit-text-fill-color:#FFFFFF !important",
    "box-shadow:0 0 0 0.3em rgba(15,16,20,0.82)",
    "border-radius:0.16em",
    "box-decoration-break:clone",
    "-webkit-box-decoration-break:clone",
  ];
}
const HIDE_DECLS = ["visibility:hidden !important"];

// Text that overruns its own box is brought back inside it by TYPE, never by
// geometry: the element keeps its position and its parent keeps its size, so
// nothing can be pushed off-frame. overflow-wrap carries the case the shrink alone
// can't reach — a single unbreakable token wider than the column.
function shrinkDecls(fontPx, linePx) {
  const decls = [`font-size:${fontPx}px !important`];
  if (linePx > 0) decls.push(`line-height:${linePx}px !important`);
  decls.push("overflow-wrap:anywhere", "hyphens:auto");
  return decls;
}

// Fraction of the TEXT box that sits over the graphic box.
function overlapFrac(t, g) {
  const ix = Math.max(0, Math.min(t.x + t.w, g.x + g.w) - Math.max(t.x, g.x));
  const iy = Math.max(0, Math.min(t.y + t.h, g.y + g.h) - Math.max(t.y, g.y));
  const inter = ix * iy;
  const area = t.w * t.h;
  return area > 0 ? inter / area : 0;
}

/* c8 ignore start — runs inside Chromium */
// Collect visible content at the current seek and settle the two spatial questions
// that need the live DOM: which solid node is painted OVER which text, and which
// text does not fit the box it was given. Mirrors contrast_check's selectorOf +
// settled-opacity gate. Returns { boxes, occlusions, overruns }.
function collectFrame(frameW, frameH) {
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
  // elementsFromPoint skips anything with pointer-events:none, and decorative
  // overlays set it as a matter of course — without this the paint-order test is
  // blind to exactly the ornaments it exists to catch.
  const hitStyle = document.createElement("style");
  hitStyle.textContent = "*{pointer-events:auto !important}";
  document.head.appendChild(hitStyle);

  const els = [];
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
    const bc = cs.backgroundColor || "";
    const m = bc.match(/rgba?\(([^)]+)\)/);
    let alpha = 0;
    if (m) { const p = m[1].split(",").map((s) => parseFloat(s)); alpha = p.length === 4 ? (p[3] || 0) : 1; }
    const media = /^(IMG|VIDEO|CANVAS|SVG|PICTURE)$/.test(tag) || bg.includes("url(");
    // Anything that PAINTS can hide what is behind it. The old rule counted only
    // media, which is why cards, rules and gradient panels — the things QA actually
    // names — were never even collected. Widening this is only safe because the
    // paint-order test below decides whether the cover is real.
    const solid = media || alpha >= 0.35 || (bg && bg !== "none");
    // An ornament carries no information: no text anywhere beneath it and no
    // picture of its own, so dropping it costs the film nothing.
    const ornament = !media && !el.textContent.trim() && !el.querySelector("img,video,canvas,svg,picture");
    const text = direct ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    // A display face set with leading TIGHTER than its glyph box reports
    // scrollHeight > clientHeight on every single line — that is the type style,
    // not overflow. Measured across six shipped comps, 211 of 211 naive
    // scroll-vs-client hits were this artifact (lh 91.4px under fs 97.2px), so the
    // deficit is discounted before asking whether a real LINE is being cut.
    const fontPx = parseFloat(cs.fontSize) || 0;
    const linePx = parseFloat(cs.lineHeight) || fontPx;
    const lead = Math.max(0, fontPx - linePx);
    const vOver = el.clientHeight > 0 ? el.scrollHeight - el.clientHeight - lead : 0;
    const hOver = el.clientWidth > 0 ? el.scrollWidth - el.clientWidth : 0;
    els.push(el);
    boxes.push({
      selector: selectorOf(el),
      kind: direct ? "text" : (media ? "graphic" : null),
      text,
      normText: text.toLowerCase(),
      bbox,
      areaFrac: (bbox.w * bbox.h) / (frameW * frameH),
      hasSolidBg: alpha >= 0.5,
      solid, ornament, fontPx, linePx, vOver, hOver,
      fits: { h: el.clientHeight, w: el.clientWidth, sh: el.scrollHeight, sw: el.scrollWidth },
    });
  }

  const frac = (t, g) => {
    const ix = Math.max(0, Math.min(t.x + t.w, g.x + g.w) - Math.max(t.x, g.x));
    const iy = Math.max(0, Math.min(t.y + t.h, g.y + g.h) - Math.max(t.y, g.y));
    return t.w * t.h > 0 ? (ix * iy) / (t.w * t.h) : 0;
  };
  // Does the browser paint `ge` above `te` where they overlap? elementsFromPoint
  // returns the whole stack topmost-first, so this is the real answer rather than a
  // z-index/DOM-order guess — and it is what exempts an intentional overlap: a
  // scrim or a card sits BELOW its own text and therefore never qualifies.
  const paintsOver = (ge, te, tb, gb) => {
    const x0 = Math.max(tb.x, gb.x), y0 = Math.max(tb.y, gb.y);
    const x1 = Math.min(tb.x + tb.w, gb.x + gb.w), y1 = Math.min(tb.y + tb.h, gb.y + gb.h);
    if (!(x1 > x0 && y1 > y0)) return false;
    let seen = 0, above = 0;
    for (let a = 1; a <= 3; a++) {
      for (let b = 1; b <= 3; b++) {
        const stack = document.elementsFromPoint(x0 + ((x1 - x0) * a) / 4, y0 + ((y1 - y0) * b) / 4);
        let ti = -1, gi = -1;
        for (let k = 0; k < stack.length; k++) {
          if (ti < 0 && te.contains(stack[k])) ti = k;
          if (gi < 0 && ge.contains(stack[k])) gi = k;
        }
        if (ti < 0) continue;
        seen++;
        if (gi >= 0 && gi < ti) above++;
      }
    }
    return seen >= 3 && above / seen >= 0.6;
  };

  const occlusions = [];
  const overruns = [];
  const texts = [];
  for (let i = 0; i < boxes.length; i++) if (boxes[i].kind === "text" && boxes[i].text.length >= 4) texts.push(i);
  const solids = [];
  for (let i = 0; i < boxes.length; i++) if (boxes[i].solid && boxes[i].areaFrac >= 0.005 && boxes[i].areaFrac <= 0.6) solids.push(i);
  let budget = 400; // hit-testing is the only expensive step; cap it per frame
  for (const ti of texts) {
    const t = boxes[ti];
    // Half a line of real content past the box edge, or a token wider than the
    // column — either way the copy is being cut or is spilling onto its neighbour.
    if ((t.linePx > 0 && t.vOver >= t.linePx * 0.5) || t.hOver >= Math.max(6, t.fontPx * 0.25)) {
      const kv = t.vOver > 0 && t.fits.sh > 0 ? t.fits.h / Math.max(1, t.fits.sh - Math.max(0, t.fontPx - t.linePx)) : 1;
      const kh = t.hOver > 0 && t.fits.sw > 0 ? t.fits.w / t.fits.sw : 1;
      const k = Math.max(0.7, Math.min(0.97, Math.min(kv, kh)));
      overruns.push({ selector: t.selector, text: t.text, scale: k, fontPx: t.fontPx, linePx: t.linePx });
    }
    if (t.hasSolidBg) continue; // already reads on its own chip
    for (const gi of solids) {
      if (gi === ti) continue;
      const g = boxes[gi];
      if (els[ti].contains(els[gi]) || els[gi].contains(els[ti])) continue; // a container is not colliding with its own content
      if (frac(t.bbox, g.bbox) < 0.25) continue;
      if (budget <= 0) break;
      budget--;
      if (!paintsOver(els[gi], els[ti], t.bbox, g.bbox)) continue;
      occlusions.push({
        selector: t.selector, text: t.text,
        over: g.selector, ornament: !!g.ornament && g.areaFrac <= 0.25,
      });
      break;
    }
  }
  hitStyle.remove();
  // Only text and occluders cross back to Node — everything else was scaffolding
  // for the two in-page tests and would triple the payload for nothing.
  return { boxes: boxes.filter((b) => b.kind === "text" || b.solid), occlusions, overruns };
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
    // Wait for a LIVE composition root — bundled-template packs rebuild it after
    // React mounts, so reading on `load` sees nothing and skips the whole fixer.
    // See the same note in contrast_check.js.
    await page.waitForFunction(() => {
      const r = document.querySelector("[data-composition-id]");
      return !!(r && r.clientHeight > 0 && r.clientWidth > 0);
    }, { timeout: Math.min(20000, Math.max(1, deadline - Date.now())), polling: 200 }).catch(() => { /* fall through to the skip below */ });
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
      const f = await page.evaluate(collectFrame, meta.w, meta.h);
      frames.push({ t, boxes: f.boxes, occlusions: f.occlusions, overruns: f.overruns });
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
  const ornMap = new Map(); // selector       -> { selector }
  const ovrMap = new Map(); // selector||text -> { selector, text, scale, fontPx, linePx }
  for (const frame of frames || []) {
    const boxes = frame.boxes || [];
    const texts = boxes.filter((b) => b.kind === "text" && b.text.length >= 4);
    // Obstacles are CONTENT images only: between 2% and 60% of the frame. Below 2%
    // is an icon/decoration; above 60% is a full-bleed background/hero the design
    // intentionally sets text on — neither is a "collision".
    const graphics = boxes.filter((b) => b.kind === "graphic" && b.areaFrac >= 0.02 && b.areaFrac <= 0.6);

    // duplicates within this frame: same normalized text on 2+ distinct elements.
    // Only multi-word LINES qualify — the defect class is a redundant subtitle/
    // caption. Word-level animation spans (.kfw) legally repeat single words
    // across a film, and hideText's selector+prefix matching would hide them in
    // EVERY scene (a quote beat once lost 3 of its 4 words this way).
    const groups = new Map();
    for (const t of texts) {
      if (t.text.length < 12 || !t.text.includes(" ")) continue;
      if (!groups.has(t.normText)) groups.set(t.normText, []);
      groups.get(t.normText).push(t);
    }
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

    // collisions: the probe already settled paint order in the page, so trust its
    // verdict. Frames without one come from the unit harness (and from any future
    // caller feeding synthetic boxes) — fall back to the geometric text-over-image
    // rule so this stays analysable without a browser.
    if (Array.isArray(frame.occlusions)) {
      for (const o of frame.occlusions) {
        // A pure ornament is dropped instead of scrimming the copy: hiding a rule
        // or a blob costs nothing, scrimming the headline changes the design.
        if (o.ornament) ornMap.set(o.over, { selector: o.over });
        else colMap.set(`${o.selector}||${o.text}`, { selector: o.selector, text: o.text });
      }
    } else {
      for (const t of texts) {
        if (t.hasSolidBg) continue;
        for (const g of graphics) {
          if (g.selector === t.selector) continue;
          if (overlapFrac(t.bbox, g.bbox) > 0.55) { colMap.set(`${t.selector}||${t.text}`, { selector: t.selector, text: t.text }); break; }
        }
      }
    }

    // overruns: keep the tightest shrink asked for across the samples, so one pass
    // fixes the worst beat rather than the first one we happened to look at.
    for (const o of frame.overruns || []) {
      const key = `${o.selector}||${o.text}`;
      const prev = ovrMap.get(key);
      if (!prev || o.scale < prev.scale) ovrMap.set(key, { ...o });
    }
  }
  // never scrim or shrink a duplicate we're already hiding
  for (const k of dupMap.keys()) { colMap.delete(k); ovrMap.delete(k); }
  return { duplicates: [...dupMap.values()], collisions: [...colMap.values()], ornaments: [...ornMap.values()], overruns: [...ovrMap.values()] };
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

function applyFixes(html, { duplicates, collisions, ornaments = [], overruns = [] }) {
  const changed = [];
  // A finding the string fixer cannot reach is the OTHER half of "QA flagged it and
  // the film shipped anyway": bundled-template packs build their DOM at render time
  // from window.OM_SCENES, so the nodes the probe measured are not tags in
  // index.html at all — measured on four rebuilt films, 0 of 101 probed text nodes
  // were locatable, against 36/36 on a comp whose markup is authored. Counting them
  // makes that no-op auditable instead of silent (fallback_log's lesson).
  const unreachable = [];
  let duplicatesRemoved = 0, collisionsScrimmed = 0, ornamentsHidden = 0, textShrunk = 0;
  for (const d of duplicates) {
    const res = hideText(html, d.selector, d.text, d.mode === "keepOne");
    if (res.hidden) { html = res.html; duplicatesRemoved += res.hidden; changed.push(`hide-duplicate: ${d.selector} "${d.text.slice(0, 30)}" ×${res.hidden}`); }
    else unreachable.push({ kind: "duplicate", selector: d.selector, text: d.text });
  }
  for (const c of collisions) {
    const hits = locate(html, c.selector, c.text);
    if (!hits.length) { unreachable.push({ kind: "collision", selector: c.selector, text: c.text }); continue; }
    let applied = 0; const done = new Set();
    for (const h of hits) {
      if (done.has(h.openTag)) continue;
      const nt = withDecls(h.openTag, collisionScrimDecls());
      if (nt !== h.openTag) { html = html.split(h.openTag).join(nt); done.add(h.openTag); applied++; }
    }
    if (applied) { collisionsScrimmed += applied; changed.push(`scrim-collision: ${c.selector} "${c.text.slice(0, 30)}"`); }
  }
  for (const o of ornaments) {
    // An ornament carries no text, so the locator has nothing but the selector to
    // go on. Act ONLY when that resolves to exactly one tag in the whole document —
    // `div.deco` matching six nodes would blank five the probe never looked at, and
    // an over-eager hide is the one failure mode this pass must not have.
    const hits = locate(html, o.selector, "");
    if (hits.length !== 1 || html.split(hits[0].openTag).length - 1 !== 1) {
      unreachable.push({ kind: "ornament", selector: o.selector, reason: hits.length ? "ambiguous selector" : "not located" });
      continue;
    }
    const nt = withDecls(hits[0].openTag, HIDE_DECLS);
    if (nt !== hits[0].openTag) { html = html.split(hits[0].openTag).join(nt); ornamentsHidden++; changed.push(`hide-ornament: ${o.selector} (occluding copy)`); }
  }
  for (const o of overruns) {
    const px = Math.max(12, Math.round(o.fontPx * o.scale));
    if (!(px < o.fontPx)) continue; // already as small as the floor allows
    const hits = locate(html, o.selector, o.text);
    if (!hits.length) { unreachable.push({ kind: "overrun", selector: o.selector, text: o.text }); continue; }
    let applied = 0; const done = new Set();
    for (const h of hits) {
      if (done.has(h.openTag)) continue;
      const nt = withDecls(h.openTag, shrinkDecls(px, o.linePx > 0 ? Math.round(o.linePx * o.scale) : 0));
      if (nt !== h.openTag) { html = html.split(h.openTag).join(nt); done.add(h.openTag); applied++; }
    }
    if (applied) { textShrunk += applied; changed.push(`shrink-to-fit: ${o.selector} "${o.text.slice(0, 30)}" ${Math.round(o.fontPx)}px→${px}px`); }
  }
  return { html, changed, duplicatesRemoved, collisionsScrimmed, ornamentsHidden, textShrunk, unreachable };
}

// Full pass: probe → analyze → apply → write. `collisionsScrimmed` is the count of
// collisions RESOLVED however they were resolved (scrim, dropped ornament, shrink) —
// callers read it as "did the overlap go away", and a repair that only ever ships
// when it is a scrim is how the duplicate/collision router lost its re-render.
// `collisionsFound` vs that total separates "found nothing" from "found it and
// could not reach it". Writes the edited index.html in place.
const nothing = () => ({ changed: [], duplicatesRemoved: 0, collisionsScrimmed: 0, collisionsFound: 0, unreachable: 0 });
async function layoutFix(jobDir, { samples = 4, timeoutMs = 45000 } = {}) {
  const probe = await layoutProbe(jobDir, { samples, timeoutMs });
  if (probe.skipped) return { ...nothing(), skipped: probe.skipped };
  const findings = analyze(probe.frames);
  const found = findings.collisions.length + findings.ornaments.length + findings.overruns.length;
  if (!findings.duplicates.length && !found) return nothing();
  const indexPath = path.join(jobDir, "index.html");
  let html;
  try { html = fs.readFileSync(indexPath, "utf8"); } catch { return { ...nothing(), collisionsFound: found }; }
  const out = applyFixes(html, findings);
  if (out.changed.length) fs.writeFileSync(indexPath, out.html, "utf8");
  return {
    changed: out.changed,
    duplicatesRemoved: out.duplicatesRemoved,
    collisionsScrimmed: out.collisionsScrimmed + out.ornamentsHidden + out.textShrunk,
    collisionsFound: found,
    scrims: out.collisionsScrimmed, ornamentsHidden: out.ornamentsHidden, textShrunk: out.textShrunk,
    unreachable: out.unreachable.length,
  };
}

module.exports = { layoutFix, layoutProbe, analyze, applyFixes, overlapFrac };
