// EMPTY TILES, MEASURED ON THE RENDER — the end-to-end half of audit-wall-slots.
//
// audit-wall-slots proves the DATA is complete: every slot the adapter believes a
// wall draws carries an image. It cannot prove the belief. `slots` is a rule —
// the authored `tiles` count, else 3 landscape / 2 portrait — and a template that
// really draws four tiles while the rule says three would still ship one empty.
//
// So this one renders each pack in Chrome and looks for the thing the user
// actually sees: the compiled films' own empty-media card, identified by the
// label it prints ("DROP IMAGE TO REPLACE" / "OFFICE PHOTO — DROP IMAGE").
// Its absence from a rendered frame is direct evidence that every media box the
// film drew received an image. See the detector note below for the two signals
// that were tried first and were both wrong.
//
//   node scripts/audit-empty-tiles.js                 # every omelette pack
//   node scripts/audit-empty-tiles.js edition-press   # one pack
//   node scripts/audit-empty-tiles.js --selftest      # prove the detector fires
//
// --selftest strips a wall tile back out and asserts the detector SEES it: a
// silent detector would otherwise report a clean sweep no matter what shipped.
//
// Exits non-zero when a placeholder reaches a frame.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const om = require("../src/services/omelette_adapter.js");

const argv = process.argv.slice(2);
const SELFTEST = argv.includes("--selftest");
// --strip=N runs the sweep with shotN.. deliberately removed from every wall.
// It answers the question the data audit cannot: which templates draw a FIXED
// tile grid (a missing prop paints a placeholder) versus a data-driven one (a
// missing prop draws nothing). Only the fixed ones can ever ship an empty card,
// and this names them — which is also the honest measure of how much of the
// clean sweep is real coverage rather than a silent detector.
const STRIP = (() => {
  const a = argv.find((x) => /^--strip(=\d+)?$/.test(x));
  return a ? Number((a.split("=")[1]) || 3) : 0;
})();
const only = argv.filter((a) => !a.startsWith("-"));
const CONC = Number(process.env.KF_CONC || 3);
const OUT = process.env.KF_OUT
  || "C:/Users/kalua/AppData/Local/Temp/claude/C--internship-KEYFRAME/d662f9ed-c87e-4396-95a8-c542a9b05f2e/scratchpad/emptytiles";
const FR = path.join(__dirname, "..", "..", "frames");

// A REAL job's asset folder, so the pool has the mix a film actually gets
// (screenshots, photographs, vectors) rather than an idealised one.
function pickJobAssets() {
  const jobs = path.join(__dirname, "..", "jobs");
  for (const d of fs.readdirSync(jobs)) {
    const p = path.join(jobs, d, "assets", "images");
    try { if (fs.readdirSync(p).length >= 4) return path.join(jobs, d, "assets"); } catch { /* next */ }
  }
  return null;
}

// Same classifier the capacity audit uses — source and kind decide how the
// adapter ranks and places a file, so getting them wrong changes the fill.
function assetsFrom(dir) {
  const d = path.join(dir, "assets/images");
  const A = [];
  for (const f of fs.readdirSync(d)) {
    const p = `assets/images/${f}`;
    if (/^logo\./i.test(f)) { A.push({ path: p, type: "image", kind: "logo", alt: "logo", source: "website" }); continue; }
    if (/\.svg$/i.test(f)) { A.push({ path: p, type: "image", source: "iconify", alt: "a topical vector", visionOk: true }); continue; }
    if (/^(page_|site_)/i.test(f)) {
      A.push({ path: p, type: "image", source: "website", kind: "screenshot", width: 2732, height: 1800, ratio: 1.518,
        alt: `REAL screenshot of the ${f.replace(/[_-]/g, " ").replace(/\.\w+$/, "")} page`, cdScore: 85, cdProminence: "hero", visionOk: true });
      continue;
    }
    A.push({ path: p, type: "image", source: "pixabay", width: 1920, height: 1080, ratio: 1.78,
      alt: "a stock photo", cdScore: 55, cdProminence: "support", visionOk: true });
  }
  return A;
}

const KIND = ["hook", "context", "feature", "stat", "how", "feature", "proof", "context", "cta"];
const SCENES = Array.from({ length: 15 }, (_, i) => ({
  id: `s${i + 1}`, start: i * 2.2, duration: 2.2,
  kind: KIND[i % KIND.length], purpose: KIND[i % KIND.length],
  headline: `Beat ${i + 1} of the field manual`,
  subtext: "Everything that matters, set above the fold and locked to a strict grid.",
  onScreenText: ["Browse", "Compare", "Buy"], bullets: ["Browse it", "Compare it", "Buy it"],
  stats: [{ value: "75%", label: "return in 30 days" }], cta: "Open the app",
  voiceover: "Everything that matters, set above the fold and locked to a strict grid.",
}));

// ---- OM_SCENES read/write on a BUILT film -------------------------------------
const BLOCK = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i;
function litRange(page) {
  const i = page.indexOf("window.OM_SCENES");
  if (i < 0) return null;
  let j = page.indexOf("=", i) + 1;
  while (/\s/.test(page[j])) j++;
  const q = page[j];
  if (q !== "'" && q !== '"') return null;
  let k = j + 1;
  while (k < page.length) { if (page[k] === "\\") { k += 2; continue; } if (page[k] === q) break; k++; }
  return { j, k, q };
}
function readScenes(html) {
  const b = BLOCK.exec(html);
  if (!b) return null;
  let page; try { page = JSON.parse(b[1]); } catch { return null; }
  const r = litRange(page);
  if (!r) return null;
  const lit = page.slice(r.j, r.k + 1);
  const json = r.q === '"' ? JSON.parse(lit) : lit.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  try { return JSON.parse(json); } catch { return null; }
}
function writeScenes(html, scenes) {
  const page = JSON.parse(BLOCK.exec(html)[1]);
  const r = litRange(page);
  const next = page.slice(0, r.j) + JSON.stringify(JSON.stringify(scenes)) + page.slice(r.k + 1);
  return html.replace(BLOCK, () => `<script type="__bundler/template">${JSON.stringify(next).replace(/<\//g, "<\\/")}</script>`);
}

// ---- the detector, run inside the page ----------------------------------------
// The card is drawn by the film's own MediaSlot/Slot component when its `src`
// prop is falsy, and it prints a label. That label is the signal. The text is
// assembled at runtime — it appears in no template's source — so it can only be
// read off a rendered frame, which is the whole point of this audit.
//
// Placeholders live inside the film's shadow roots, so the walk crosses them,
// and an element only counts when it is genuinely ON SCREEN: these films keep
// other beats' layers mounted and merely hidden. Only the DEEPEST match is
// reported, so one card is not counted once per ancestor.
const PROBE = () => {
  const hits = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const matched = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 40) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      const txt = (el.textContent || "").toUpperCase().replace(/\s+/g, " ");
      // THE LABEL IS THE ONLY RELIABLE SIGNAL, and getting this wrong cost a
      // whole round of false findings. Two earlier triggers were dropped:
      //   - `.sc-placeholder` is the BUNDLER'S streaming-skeleton class, defined
      //     in boot CSS and never applied to an empty-media card. It matched
      //     nothing, which is why --selftest exists.
      //   - "a hatched box with no <img>" matched pack BACKGROUNDS: inkpress
      //     paints ruled paper with a repeating-linear-gradient across the whole
      //     1080x1920 frame, so all 15 of its beats were reported empty while
      //     the frames plainly showed no placeholder at all.
      // No film's own copy says "DROP IMAGE" / "TO REPLACE" — that string is
      // authoring chrome by construction, so it is the trigger.
      const PH = /DROP\s?(IMAGE|LOGO|PHOTO|VIDEO)|TO REPLACE/;
      if (!PH.test(txt)) continue;                       // cheap reject first
      // ...but textContent includes text that is not PAINTED. The harness fills
      // a placeholder by painting a picture over the card and hiding the chrome
      // inside it, so the label survives in textContent while being invisible —
      // and every ancestor up to the full frame then "contains" it. Matching on
      // that reported a filled card as empty, at 1080x1920. So the trigger is
      // the label being VISIBLE: walk to the text node and check its own chain.
      const visible = (node) => {
        const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        let t;
        while ((t = w.nextNode())) {
          if (!PH.test((t.nodeValue || "").toUpperCase().replace(/\s+/g, " "))) continue;
          let p = t.parentElement, hid = false;
          while (p && p !== node.parentElement) {
            const c = getComputedStyle(p);
            if (c.display === "none" || c.visibility === "hidden" || Number(c.opacity) < 0.15) { hid = true; break; }
            p = p.parentElement;
          }
          if (!hid) return true;
        }
        return false;
      };
      if (!visible(el)) continue;
      // A box that already holds a PAINTED image is a filled tile, whatever text
      // happens to sit in it.
      const img = el.querySelector("img");
      if (img && img.complete && img.naturalWidth > 0) continue;
      let node = el, hidden = false;
      while (node && node.nodeType === 1) {
        const ncs = getComputedStyle(node);
        if (ncs.display === "none" || ncs.visibility === "hidden" || Number(ncs.opacity) < 0.15) { hidden = true; break; }
        node = node.parentElement || (node.getRootNode() && node.getRootNode().host) || null;
      }
      if (hidden) continue;
      matched.push(el);
    }
  };
  walk(document);
  for (const el of matched) {
    if (matched.some((o) => o !== el && el.contains(o))) continue;   // keep the deepest
    const r = el.getBoundingClientRect();
    hits.push(`${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`);
  }
  return hits;
};

async function sweepPack(browser, pack, jobAssets, opts = {}) {
  const dir = path.join(OUT, (opts.tag ? opts.tag + "_" : "") + pack);
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(jobAssets, path.join(dir, "assets"), { recursive: true });
  const assets = assetsFrom(dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(FR, pack, "pack.json"), "utf8"));

  let built;
  try {
    built = om.buildComposition({
      storyboard: { title: "Sociology", brand: "Sociology", url: "edition.press", durationSec: 33, scenes: SCENES },
      dims: { width: 1920, height: 1080, fps: 30 }, framePack: pack, assets, manifest,
    });
  } catch (e) { return { pack, err: `build: ${String(e.message).slice(0, 60)}` }; }

  let scenes = readScenes(built.indexHtml);
  if (!scenes) return { pack, err: "no OM_SCENES" };
  let html = built.indexHtml;

  // --selftest: put the bug back for this render — strip shot3+ off every wall —
  // so a detector that never fires is caught by its own audit.
  if (opts.strip) {
    for (const s of scenes) {
      const nums = Object.keys(s).filter((x) => /^shot\d+$/.test(x)).map((x) => Number(x.slice(4)));
      if (!nums.length) continue;
      for (let i = opts.strip; i <= Math.max(...nums); i++) delete s[`shot${i}`];
      if (Array.isArray(s.images)) s.images = s.images.slice(0, opts.strip - 1);
      if (Array.isArray(s.shots)) s.shots = s.shots.slice(0, opts.strip - 1);
    }
    html = writeScenes(html, scenes);
  }
  fs.writeFileSync(path.join(dir, "index.html"), html);

  // Sample only beats that carry media, late in the beat so a staggered reveal
  // has finished (measured: a wall's last plate is still wiping in at the beat's
  // midpoint and is fully painted by ~90%).
  const marks = [];
  let t = 0;
  for (const s of scenes) {
    const dur = Number(s.dur) || 0;
    const media = Object.keys(s).some((k) => /^(shot\d*|image|images|logo)$/.test(k));
    if (media && dur > 0.4) marks.push({ name: s.name, at: [t + dur * 0.7, t + dur * 0.92] });
    t += dur;
  }
  if (!marks.length) return { pack, beats: 0, hits: [] };

  const meta = JSON.parse(built.metaJson);
  const page = await browser.newPage();
  const hits = [];
  try {
    await page.setViewport({ width: meta.width, height: meta.height, deviceScaleFactor: 1 });
    await page.goto("file:///" + path.resolve(dir, "index.html").replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 800));
    for (const m of marks) {
      for (const at of m.at) {
        await page.evaluate((x) => { const tl = (window.__timelines || {}).vid; if (tl) tl.time(x); }, at);
        await new Promise((r) => setTimeout(r, 260));
        const found = await page.evaluate(PROBE);
        if (found.length) {
          hits.push({ scene: m.name, at: +at.toFixed(2), boxes: found });
          const shot = path.join(dir, `EMPTY_${String(m.name).replace(/\W+/g, "")}_${at.toFixed(2)}.jpg`);
          try { await page.screenshot({ path: shot, type: "jpeg", quality: 80 }); } catch { /* keep the finding */ }
          break;   // one witness per beat is enough
        }
      }
    }
  } catch (e) { await page.close().catch(() => {}); return { pack, err: `render: ${String(e.message).slice(0, 60)}` }; }
  await page.close().catch(() => {});
  if (!hits.length) fs.rmSync(dir, { recursive: true, force: true });
  return { pack, beats: marks.length, hits };
}

(async () => {
  const jobAssets = pickJobAssets();
  if (!jobAssets) { console.log("no job assets folder to draw a pool from — run a job first"); process.exit(2); }

  const packs = fs.readdirSync(FR).filter((d) => {
    if (only.length && !only.includes(d)) return false;
    try { return JSON.parse(fs.readFileSync(path.join(FR, d, "pack.json"), "utf8")).renderer === "omelette"; }
    catch { return false; }
  });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files", "--disable-dev-shm-usage"],
  });

  // POSITIVE CONTROL. Prove the detector fires before trusting a clean sweep.
  //
  // It tests the DETECTOR, on a synthetic card, and deliberately not a film.
  // The control used to strip shot3+ out of a real pack and expect the hatched
  // card to appear — but the adapter's harness now FILLS any placeholder it
  // finds at seek time, so the stripped tiles came back filled and the control
  // reported the detector blind when both halves were in fact working. A
  // control that the fix can satisfy is not a control.
  const ctlPage = await browser.newPage();
  await ctlPage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await ctlPage.setContent("<!doctype html><body style='margin:0'></body>");
  const ctlHits = await ctlPage.evaluate((probeSrc) => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;left:20px;top:20px;width:420px;height:260px;background:#777;color:#fff;font:16px sans-serif";
    d.innerHTML = "<div>OFFICE PHOTO</div><div>DROP IMAGE TO REPLACE</div>";
    document.body.appendChild(d);
    // eslint-disable-next-line no-new-func
    return new Function("return (" + probeSrc + ")()")();
  }, PROBE.toString());
  await ctlPage.close().catch(() => {});
  const ctl = { hits: ctlHits.map((b) => ({ scene: "synthetic", at: 0, boxes: [b] })) };
  const ctlOk = ctlHits.length > 0;
  console.log(`\ndetector control — synthetic "DROP IMAGE TO REPLACE" card: ` +
    `${ctlHits.length} match(es) ${ctlOk ? "(detector works)" : "(DETECTOR IS BLIND)"}`);
  if (SELFTEST) { await browser.close(); process.exit(ctlOk ? 0 : 1); }
  if (!ctlOk) { await browser.close(); console.log("\nrefusing to report a sweep with a blind detector.\n"); process.exit(2); }

  const rows = [];
  let done = 0;
  const queue = packs.slice();
  // THE BROWSER DIES ON A LONG SWEEP, AND A DEAD BROWSER IS NOT A RESULT.
  //
  // 198 heavy films through one Chrome exhausted it at ~160 packs with
  // "ConnectionClosedError: Connection closed" — the run ended with no verdict
  // at all, which is the same trap as reading "PASS in 0 packs" as success. So
  // the browser is recycled every RECYCLE packs and relaunched on a crash, and
  // a pack whose page could not be opened is recorded as an ERROR (unproven)
  // rather than quietly dropped.
  const RECYCLE = 40;
  let live = browser;
  let sinceLaunch = 0;
  const relaunch = async () => {
    try { await live.close(); } catch { /* already gone */ }
    live = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files", "--disable-dev-shm-usage"],
    });
    sinceLaunch = 0;
  };
  // Serialised recycling: the workers share one browser, so it may only be
  // swapped while none of them is mid-pack.
  let inFlight = 0;
  await Promise.all(Array.from({ length: Math.max(1, CONC) }, async () => {
    for (;;) {
      const p = queue.shift();
      if (!p) return;
      if (sinceLaunch >= RECYCLE && inFlight === 0) { await relaunch(); }
      sinceLaunch++;
      inFlight++;
      let r;
      try {
        r = await sweepPack(live, p, jobAssets, STRIP ? { strip: STRIP, tag: "strip" } : {});
      } catch (e) {
        r = { pack: p, err: `browser: ${String(e.message).slice(0, 60)}` };
        if (/Connection closed|Target closed|Protocol error/i.test(String(e.message))) {
          inFlight--;
          if (inFlight === 0) await relaunch();
          rows.push(r); done++;
          continue;
        }
      }
      inFlight--;
      rows.push(r);
      done++;
      if (done % 20 === 0) process.stderr.write(`  …${done}/${packs.length}\n`);
    }
  }));
  try { await live.close(); } catch { /* already gone */ }

  const errs = rows.filter((r) => r.err);
  const bad = rows.filter((r) => r.hits && r.hits.length);
  const beats = rows.reduce((n, r) => n + (r.beats || 0), 0);

  console.log(`\nEMPTY-TILE RENDER SWEEP — ${rows.length} omelette packs, ${beats} media beats sampled`);
  console.log(`(a hit is the film's own empty-media card, visible on screen)\n`);
  if (errs.length) {
    console.log(`could not render (${errs.length}):`);
    for (const e of errs.slice(0, 20)) console.log(`  ${e.pack.padEnd(24)} ${e.err}`);
    console.log("");
  }

  // In --strip mode a HIT is the expected result: it proves the template draws a
  // fixed tile there and that the detector can see it. The interesting number is
  // the inverse — packs that showed nothing even with the props removed.
  if (STRIP) {
    const quiet = rows.filter((r) => !r.err && (!r.hits || !r.hits.length));
    console.log(`STRIP MODE (shot${STRIP}+ removed from every wall)\n`);
    console.log(`  drew a placeholder (fixed grid, detector sees it): ${bad.length}`);
    console.log(`  drew nothing (data-driven grid, or no wall beat):  ${quiet.length}`);
    console.log(`\n  The ${bad.length} above are the packs where an unfilled tile is user-visible;`);
    console.log(`  a normal run of this audit must show 0 hits for them.\n`);
    if (quiet.length) {
      console.log(`  packs that stayed clean when stripped (${quiet.length}):`);
      for (const q of quiet.slice(0, 40)) console.log(`    ${q.pack} (${q.beats} media beats)`);
      if (quiet.length > 40) console.log(`    … and ${quiet.length - 40} more`);
      console.log("");
    }
    process.exit(0);
  }

  // A PACK THAT NEVER RENDERED IS NOT A PACK THAT PASSED. With every pack
  // erroring this printed "PASS — no placeholder reached a frame in 0 packs",
  // which reads as success at a glance and was believed once: ember-roast was
  // reported fixed when in fact its page had timed out and nothing was sampled.
  const rendered = rows.length - errs.length;
  if (!rendered) {
    console.log(`NO RESULT — ${errs.length} pack(s) failed to render and none were sampled.`);
    console.log(`            Nothing was measured, so nothing is proven.\n`);
    process.exit(2);
  }
  if (!bad.length) {
    console.log(`PASS — no placeholder reached a frame in ${rendered} pack(s)` +
      (errs.length ? `, but ${errs.length} could not be rendered and are UNPROVEN (listed above).` : "."));
    console.log(`       Every media box those films drew received an image, so the adapter's`);
    console.log(`       tile-count rule covers every wall they actually draw.\n`);
    process.exit(errs.length ? 1 : 0);
  }
  console.log(`FAIL — ${bad.length} pack(s) drew an empty tile:\n`);
  for (const b of bad) {
    for (const h of b.hits) console.log(`  ${b.pack.padEnd(24)} ${String(h.scene).padEnd(14)} t=${h.at}s  ${h.boxes.join(" ")}`);
  }
  console.log(`\nframes saved under ${OUT}\n`);
  process.exit(1);
})();
