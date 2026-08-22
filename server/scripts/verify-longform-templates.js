#!/usr/bin/env node
// VERIFY THE LONG-FORM FILM COLLECTION — loads all ten templates in a real browser, over real
// HTTP, through the real route, and checks the five things that prove the integration did not
// disturb them.
//
//   1. Console is clean            no page errors, no uncaught exceptions, no failed subresource.
//   2. window.<Name>Film exists    and is a function — the film reached global scope.
//   3. --color-accent is #c67139   proves the Organic design system stylesheet is actually linked;
//                                  without it the films resolve no colour and render unstyled.
//   4. Continuous layers are 1     exactly one background mesh, one grain layer and one garnish
//                                  footnote AT EVERY PLAYHEAD POSITION, including every scene
//                                  boundary. More than one means a composition-level layer got
//                                  moved inside a scene, and the engine keeps neighbouring scenes
//                                  mounted across a cut, so it doubles exactly at the cut.
//   5. Runtime = sum of dur        the stage's own duration attribute against the OM_SCENES total.
//
// HOW THE LAYERS ARE COUNTED. The three continuous layers carry no data attribute, so they are
// identified by the signature the code gives them, matched against the inline style ATTRIBUTE
// rather than computed style — an attribute substring match costs no layout, and these are React
// inline styles so the attribute is where the value lives:
//
//   mesh    filter: blur(38px) + a radial-gradient background  (kit/bg-engine.js:98-100)
//   grain   mix-blend-mode: overlay + the fractal-noise data URI (kit/bg-engine.js:203-206)
//   wash    inset 0, opacity 0.34, pointer-events none, no text   (each film's Backdrop)
//   garnish the bottom-left footnote, matched on the film's own FOOTS strings read out of its .jsx
//
// THE SIGNATURES ARE TWO-STAGE, AND THAT IS NOT BELT-AND-BRACES. A cheap `[style*="…"]` narrows
// the candidates without touching layout, and then every candidate is confirmed against the
// element's own inline-style PROPERTIES. The single-substring version of this check reported
// 06 Split Time doubling its wash at 29 playhead positions: the second match was the headline
// "PACE IS A PLAN.", which animates through a phase where its style attribute happens to contain
// `opacity: 0.34`. Substring-matching one declaration out of an inline style is not identification.
//
// HOW THE PLAYHEAD IS SET. animations-v3.jsx listens for a 'data-om-seek-to-time-frame' CustomEvent
// on the stage root and advertises 'data-om-sync-seek' when the seek commits synchronously — so a
// seek and the counts that follow it can happen in one page.evaluate, which is what makes ~150
// samples per film affordable.
//
//   node scripts/verify-longform-templates.js              all ten
//   node scripts/verify-longform-templates.js 01 05        just those
//   node scripts/verify-longform-templates.js --quick      one sample per scene, no boundary pairs
//   node scripts/verify-longform-templates.js --json       machine-readable

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const lf = require("../src/services/longform_templates");
const { buildRouter } = require("../src/routes/longform");
const { findChromium } = require("../src/services/runtime_check");

const ARGS = process.argv.slice(2);
const QUICK = ARGS.includes("--quick");
const AS_JSON = ARGS.includes("--json");
// --offline aborts every request that does not go to our own origin, which is the only honest way
// to answer "does this still render inside a container with no egress". Route A pulls its React and
// Babel from unpkg.com unless longform_vendor/ is populated, so this is the guard that keeps the
// local-runtime redirect wired.
const OFFLINE = ARGS.includes("--offline");
const ONLY = ARGS.filter((a) => !a.startsWith("--"));

const EXPECTED_ACCENT = "#c67139";

// Subresources that 404 by design outside the authoring host. Named individually rather than
// pattern-matched away, so a NEW 404 is still a failure.
//
//   .image-slots.state.json  image-slot.js:174 fetches a sidecar that only exists once someone has
//                            dragged an image into a slot in the authoring host. The fetch is
//                            caught and the slot falls back to its declared src, so this is
//                            cosmetic — but it is a console error on every single load, and any
//                            "console must be clean" gate has to know about it.
//   favicon.ico              requested by the browser, not by the collection.
const EXPECTED_404 = [".image-slots.state.json", "/favicon.ico"];

/** Read `const FOOTS = [...]` out of a film so the garnish footnote can be found by its text. */
function footsOf(templateId) {
  const dir = path.join(lf.COLLECTION_DIR, "templates", templateId);
  const film = fs.readdirSync(dir).find((f) => f.endsWith("-film.jsx"));
  if (!film) return [];
  const src = fs.readFileSync(path.join(dir, film), "utf8");
  const m = src.match(/^const FOOTS\s*=\s*(\[[\s\S]*?\]);/m);
  if (!m) return [];
  try {
    // Repo-local source, read to recover a string array the film does not export.
    return new Function(`return ${m[1]}`)().map(String);
  } catch { return []; }
}

/** The playhead positions to sample. Boundaries first — that is where doubling shows. */
function samplesFor(scenes, quick) {
  const starts = [];
  let acc = 0;
  for (const s of scenes) { starts.push(acc); acc += Number(s.dur) || 0; }
  const total = acc;
  const out = [{ t: 0.05, why: "start" }];
  for (let i = 1; i < starts.length; i++) {
    const b = +starts[i].toFixed(3);
    out.push({ t: b, why: `boundary ${scenes[i - 1].name}->${scenes[i].name}` });
    // Just INSIDE the incoming scene, while the engine still has the outgoing one mounted. This is
    // the exact window a per-scene continuous layer doubles in.
    if (!quick) out.push({ t: +(b + 0.05).toFixed(3), why: `boundary+0.05 ${scenes[i].name}` });
  }
  for (let i = 0; i < starts.length; i++) {
    out.push({ t: +(starts[i] + (Number(scenes[i].dur) || 0) / 2).toFixed(3), why: `mid ${scenes[i].name}` });
  }
  out.push({ t: +(total - 0.05).toFixed(3), why: "end" });
  return { samples: out, total };
}

// Runs INSIDE the page. Seeks to each time and counts the continuous layers there.
function sweepInPage(times, foots) {
  const root = document.querySelector("[data-om-exportable-video-with-duration-secs]");
  const out = [];
  for (const t of times) {
    // `sync: true` IS THE WHOLE POINT. animations-v3.jsx:537 only routes the commit through
    // ReactDOM.flushSync when the seek is marked; an unmarked seek takes React's async path and
    // dispatchEvent returns before the DOM has moved — so every count below would be read from the
    // PREVIOUS playhead position. The stage advertises the capability as data-om-sync-seek.
    root.dispatchEvent(new CustomEvent("data-om-seek-to-time-frame", { detail: { time: t, sync: true } }));
    let garnish = 0;
    if (foots.length) {
      const wanted = new Set(foots);
      for (const el of document.querySelectorAll("div")) {
        if (el.children.length === 0 && wanted.has((el.textContent || "").trim())) garnish++;
      }
    }
    const count = (probe, ok) => {
      let n = 0;
      for (const el of document.querySelectorAll(probe)) if (ok(el.style, el)) n++;
      return n;
    };
    out.push({
      t,
      mesh: count('[style*="blur(38px)"]', (st) => st.filter === "blur(38px)" && st.backgroundImage.includes("radial-gradient")),
      grain: count('[style*="feTurbulence"]', (st) => st.mixBlendMode === "overlay" && st.backgroundImage.includes("feTurbulence")),
      wash: count('[style*="opacity: 0.34"]', (st, el) =>
        st.opacity === "0.34" && st.pointerEvents === "none" && st.position === "absolute"
        && st.inset === "0px" && !(el.textContent || "").trim()),
      garnish,
      els: document.querySelectorAll("*").length,
    });
  }
  return out;
}

async function checkOne(browser, base, tpl) {
  const page = await browser.newPage();
  const errors = [];
  const bad404 = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const text = m.text();
    // The browser logs its own line for a 404; the response handler below is the authority on
    // which URL it was, so this one is only kept when it is something else.
    if (/Failed to load resource/.test(text)) return;
    errors.push(`${m.type()}: ${text.slice(0, 200)}`);
  });
  page.on("requestfailed", (r) => {
    if (OFFLINE && !r.url().startsWith(base)) return;   // we aborted it on purpose
    errors.push(`requestfailed: ${r.url().slice(0, 120)} (${r.failure() && r.failure().errorText})`);
  });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const url = r.url();
    if (EXPECTED_404.some((s) => url.includes(s))) { bad404.push(url); return; }
    errors.push(`HTTP ${r.status()}: ${url.slice(0, 120)}`);
  });

  const blocked = [];
  if (OFFLINE) {
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = r.url();
      if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return r.continue();
      blocked.push(u.replace(/^(https?:\/\/[^/]+).*$/, "$1"));
      return r.abort();
    });
  }

  const res = { id: tpl.id, title: tpl.title, global: tpl.global };
  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    const t0 = Date.now();
    await page.goto(base + tpl.url, { waitUntil: "load", timeout: 90000 });
    await page.waitForSelector("[data-om-exportable-video-with-duration-secs]", { timeout: 90000 });
    res.mountMs = Date.now() - t0;

    const head = await page.evaluate((globalName, expected) => {
      const root = document.querySelector("[data-om-exportable-video-with-duration-secs]");
      const stage = root.getBoundingClientRect();
      return {
        globalType: typeof window[globalName],
        accent: getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim(),
        accentOk: getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() === expected,
        fontHeading: getComputedStyle(document.documentElement).getPropertyValue("--font-heading").trim(),
        durationAttr: Number(root.getAttribute("data-om-exportable-video-with-duration-secs")),
        syncSeek: root.getAttribute("data-om-sync-seek") === "true",
        stageW: Math.round(stage.width), stageH: Math.round(stage.height),
      };
    }, tpl.global, EXPECTED_ACCENT);
    Object.assign(res, head);

    if (!head.syncSeek) errors.push("stage does not advertise data-om-sync-seek — layer counts may lag the seek");

    const foots = footsOf(tpl.id);
    res.footsFound = foots.length;
    const { samples, total } = samplesFor(tpl.scenes, QUICK);
    res.sampleCount = samples.length;
    res.scenesTotal = +total.toFixed(3);

    // Batched so one long evaluate cannot trip the protocol timeout.
    const rows = [];
    const t1 = Date.now();
    for (let i = 0; i < samples.length; i += 25) {
      const chunk = samples.slice(i, i + 25).map((s) => s.t);
      rows.push(...await page.evaluate(sweepInPage, chunk, foots));
    }
    res.sweepMs = Date.now() - t1;

    const why = new Map(samples.map((s) => [s.t, s.why]));
    const viol = [];
    for (const r of rows) {
      for (const k of ["mesh", "grain", "wash", "garnish"]) {
        if (r[k] !== 1) viol.push({ t: r.t, layer: k, count: r[k], at: why.get(r.t) || "" });
      }
    }
    res.violations = viol;
    res.layerCounts = ["mesh", "grain", "wash", "garnish"].reduce((a, k) => {
      const vals = rows.map((r) => r[k]);
      a[k] = { min: Math.min(...vals), max: Math.max(...vals) };
      return a;
    }, {});
    // Proves the seeks actually landed: a film whose DOM never changes across 150 playhead
    // positions is a film that never moved, and every layer count above would be one stale reading.
    res.domVaried = new Set(rows.map((r) => r.els)).size > 1;

    res.errors = errors;
    res.expected404 = [...new Set(bad404)].map((u) => u.replace(base, ""));
    res.blockedHosts = [...new Set(blocked)];
    res.ok = !errors.length
      && head.globalType === "function"
      && head.accentOk
      && head.durationAttr === res.scenesTotal
      && res.scenesTotal === tpl.durationSec
      && !viol.length
      && res.domVaried;
  } catch (e) {
    res.ok = false;
    res.fatal = String(e && e.message || e).slice(0, 300);
    res.errors = errors;
  } finally {
    await page.close().catch(() => {});
  }
  return res;
}

async function main() {
  const all = lf.listTemplates();
  const picked = ONLY.length ? all.filter((t) => ONLY.some((o) => t.id.includes(o) || t.global.toLowerCase().includes(o.toLowerCase()))) : all;
  if (!picked.length) { console.error(`no templates matched ${ONLY.join(", ")}`); process.exit(2); }

  const app = express();
  app.use(lf.MOUNT, buildRouter());
  const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;

  const exe = findChromium();
  if (!exe) { console.error("no Chromium found; set PUPPETEER_EXECUTABLE_PATH"); process.exit(2); }
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: exe, headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });

  const results = [];
  try {
    for (const tpl of picked) {
      if (!AS_JSON) process.stderr.write(`  loading ${tpl.id} … `);
      const r = await checkOne(browser, base, tpl);
      results.push(r);
      if (!AS_JSON) process.stderr.write(`${r.ok ? "ok" : "FAIL"} (${r.mountMs || "-"}ms mount, ${r.sweepMs || "-"}ms sweep)\n`);
    }
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }

  if (AS_JSON) { console.log(JSON.stringify({ base, results }, null, 2)); }
  else { report(results); }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

/** "1" when a layer held at exactly one everywhere, or "min-max" when it did not. */
function rangeOf(r, key) {
  const c = r.layerCounts && r.layerCounts[key];
  if (!c) return "-";
  return c.min === c.max ? String(c.min) : c.min + "-" + c.max;
}

function report(rows) {
  const y = (b) => (b ? "yes" : "NO");
  const cols = [
    ["Template", (r) => r.title],
    ["Global", (r) => `${r.global}${r.globalType === "function" ? "" : ` (${r.globalType})`}`],
    ["fn", (r) => y(r.globalType === "function")],
    ["--color-accent", (r) => r.accent || "-"],
    ["mesh", (r) => rangeOf(r, "mesh")],
    ["grain", (r) => rangeOf(r, "grain")],
    ["garnish", (r) => rangeOf(r, "garnish")],
    ["wash", (r) => rangeOf(r, "wash")],
    ["runtime", (r) => (r.durationAttr === undefined ? "-" : `${r.durationAttr}s / ${r.scenesTotal}s`)],
    ["samples", (r) => String(r.sampleCount || 0)],
    ["console", (r) => (r.errors && r.errors.length ? `${r.errors.length} ERR` : "clean")],
    ["pass", (r) => (r.ok ? "PASS" : "FAIL")],
  ];
  const table = [cols.map((c) => c[0]), ...rows.map((r) => cols.map((c) => String(c[1](r))))];
  const w = table[0].map((_, i) => Math.max(...table.map((t) => t[i].length)));
  const line = (t) => "| " + t.map((v, i) => v.padEnd(w[i])).join(" | ") + " |";
  console.log("");
  console.log(line(table[0]));
  console.log("|" + w.map((n) => "-".repeat(n + 2)).join("|") + "|");
  for (const t of table.slice(1)) console.log(line(t));
  console.log("");

  for (const r of rows) {
    if (r.fatal) console.log(`${r.id}: FATAL ${r.fatal}`);
    if (r.errors && r.errors.length) {
      console.log(`${r.id}: ${r.errors.length} console/network error(s)`);
      for (const e of r.errors.slice(0, 8)) console.log(`    ${e}`);
    }
    if (r.violations && r.violations.length) {
      console.log(`${r.id}: ${r.violations.length} continuous-layer violation(s)`);
      for (const v of r.violations.slice(0, 8)) console.log(`    t=${v.t}s ${v.layer}=${v.count} (${v.at})`);
    }
    if (r.expected404 && r.expected404.length) {
      console.log(`${r.id}: expected 404s (not counted as failures): ${r.expected404.join(", ")}`);
    }
    if (r.domVaried === false) console.log(`${r.id}: DOM never changed across the sweep — seeks did not land`);
    if (r.blockedHosts && r.blockedHosts.length) console.log(`${r.id}: rendered with these hosts blocked: ${r.blockedHosts.join(", ")}`);
  }
  const pass = rows.filter((r) => r.ok).length;
  console.log(`${pass}/${rows.length} templates pass`);
}

main().catch((e) => { console.error(e); process.exit(2); });
