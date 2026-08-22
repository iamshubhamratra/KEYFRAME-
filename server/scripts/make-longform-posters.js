#!/usr/bin/env node
// POSTERS FOR THE TEN LONG-FORM FILMS — rendered from each film's own composer, never painted by
// hand, so a poster cannot drift from what the film actually looks like. Same principle as
// make-pack-media.js does for the frame packs.
//
// WHICH FRAME. Five candidates, spread across the middle of the running order and each sampled 62%
// into its scene; the one with the most TYPE on screen wins.
//
//   · the middle of the film, because the open, the hook and the chapter dividers are deliberately
//     sparse title cards and make a poster that says nothing about the film.
//   · 62% into a scene, because choreography runs over roughly the first 40% of every beat
//     (templates/README.md, "Pacing") and then holds — sampling earlier catches type mid-flight.
//   · most type wins, measured as the stage's rendered text length with the garnish subtracted.
//
// A single fixed position was tried first and is not enough: at 35% of the running order, Lunch
// Rush lands on a beat whose content is one image slot, and with no image supplied the poster came
// out as an empty cream frame with a garnish pill on it. Scoring by type picks a frame where the
// film is actually saying something, and for the same reason skips the beats whose whole content is
// an unfilled slot — templates 02-10 carry 10-22 of those.
//
// Explicitly NOT "the brightest or busiest frame": that rule reliably selects a full-bleed plate or
// a chapter card and produces ten posters that all look alike. The garnish is subtracted for the
// same reason — it is on every frame, so it cannot discriminate between them.
//
//   node scripts/make-longform-posters.js            all ten, skipping ones already on disk
//   node scripts/make-longform-posters.js --force    re-render every one
//   node scripts/make-longform-posters.js 01 05      only these

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const lf = require("../src/services/longform_templates");
const { buildRouter } = require("../src/routes/longform");
const { findChromium } = require("../src/services/runtime_check");
const config = require("../src/config");

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes("--force");
const ONLY = ARGS.filter((a) => !a.startsWith("--"));

/** Public, because a poster is exactly as public as the film it depicts. */
const OUT_DIR = path.join(config.paths.root, "public", "longform");

const CANDIDATES = [0.25, 0.35, 0.45, 0.55, 0.65];  // where in the running order to look
/** A frame must carry at least this share of non-ground pixels to be worth using as a poster. */
const MIN_INK = 0.02;
const WITHIN = 0.62;     // how far into a scene to take the frame
const POSTER_W = 960;    // half of 1920 — retina-sharp in a card, ~30-45 KB as jpeg

/** The candidate frames, as {t, scene} in running order. */
function candidates(scenes) {
  const starts = [];
  let acc = 0;
  for (const s of scenes) { starts.push(acc); acc += Number(s.dur) || 0; }
  const seen = new Set();
  const out = [];
  for (const frac of CANDIDATES) {
    const i = Math.min(scenes.length - 1, Math.max(0, Math.floor(scenes.length * frac)));
    if (seen.has(i)) continue;
    seen.add(i);
    out.push({ t: +(starts[i] + (Number(scenes[i].dur) || 0) * WITHIN).toFixed(2), scene: scenes[i].name });
  }
  return out;
}

/**
 * Runs in the page: seek, then measure the type the scene actually put on screen.
 *
 * NOT root.textContent. animations-v3.jsx inlines the @font-face rules into the svg's foreignObject
 * so the stage serializes with its fonts, and that stylesheet is ~155 KB of text — it drowns the
 * few hundred characters of real copy and scores every candidate within 0.2% of every other. The
 * first version of this scorer did exactly that and still picked the blank frame.
 *
 * So: visible LEAF text only, skipping <style>, and skipping the garnish (pointer-events:none),
 * which prints on every frame and therefore cannot discriminate between them.
 */
function scoreInPage(times) {
  const root = document.querySelector("[data-om-exportable-video-with-duration-secs]");
  const stage = root.getBoundingClientRect();
  const out = [];
  for (const t of times) {
    root.dispatchEvent(new CustomEvent("data-om-seek-to-time-frame", { detail: { time: t, sync: true } }));
    let n = 0;
    for (const el of root.querySelectorAll("div, span, p, text, tspan")) {
      if (el.children.length) continue;                       // leaves only, so nothing double-counts
      if (el.closest("style, script, defs")) continue;
      const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt) continue;
      if (el.closest('[style*="pointer-events: none"]')) continue;   // the garnish layer
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;              // laid out but not showing
      if (r.right < stage.left || r.left > stage.right || r.bottom < stage.top || r.top > stage.bottom) continue;
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none" || parseFloat(st.opacity) < 0.05) continue;
      n += txt.length;
    }
    out.push(n);
  }
  return out;
}

/**
 * What fraction of the frame is NOT its own ground?
 *
 * The ground is taken as the most common luminance bucket rather than assumed light or dark: these
 * ten films run from bone to near-black, so any fixed threshold would call half of them empty. A
 * frame showing only the garnish scores well under a percent; a frame with a headline and a chart
 * is comfortably into double figures.
 */
async function inkCoverage(sharp, png) {
  const { data, info } = await sharp(png).resize(240).greyscale().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Array(32).fill(0);
  for (let i = 0; i < data.length; i++) buckets[data[i] >> 3]++;
  let ground = 0;
  for (let b = 1; b < buckets.length; b++) if (buckets[b] > buckets[ground]) ground = b;
  let ink = 0;
  for (let i = 0; i < data.length; i++) { const b = data[i] >> 3; if (b < ground - 1 || b > ground + 1) ink++; }
  return ink / (info.width * info.height);
}

async function main() {
  const all = lf.listTemplates();
  const picked = ONLY.length ? all.filter((t) => ONLY.some((o) => t.id.includes(o))) : all;
  if (!picked.length) { console.error(`no templates matched ${ONLY.join(", ")}`); process.exit(2); }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const todo = picked.filter((t) => FORCE || !fs.existsSync(path.join(OUT_DIR, `${t.id}.jpg`)));
  if (!todo.length) { console.log(`all ${picked.length} posters already on disk (use --force to re-render)`); return; }

  const app = express();
  app.use(lf.MOUNT, buildRouter());
  const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;

  const exe = findChromium();
  if (!exe) { console.error("no Chromium found; set PUPPETEER_EXECUTABLE_PATH"); process.exit(2); }
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: exe, headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 180000,
  });
  const sharp = require("sharp");

  let made = 0;
  try {
    for (const tpl of todo) {
      const page = await browser.newPage();
      try {
        // 1140 tall, not 1080: the stage sits above a playback bar and scales itself down to fit
        // the viewport, so at 1080 the poster would be a 1842x1036 downscale of a 1920x1080 design.
        await page.setViewport({ width: 1920, height: 1140, deviceScaleFactor: 1 });
        await page.goto(base + tpl.url, { waitUntil: "load", timeout: 90000 });
        await page.waitForSelector("[data-om-exportable-video-with-duration-secs]", { timeout: 90000 });
        await page.evaluate(() => document.fonts && document.fonts.ready);
        const cands = candidates(tpl.scenes);
        const scores = await page.evaluate(scoreInPage, cands.map((c) => c.t));
        // Most type first, then confirm on PIXELS. The DOM score alone is not enough: Lunch Rush
        // wipes with `wipeColor={C.paper}`, so at 62% into that beat an opaque cream panel covers a
        // scene whose type is present, on-stage and at full opacity in the tree — and the garnish,
        // which draws above every scene, is the only thing left showing. No DOM query can see that;
        // it is a compositing fact. So each candidate is rendered in score order and kept only once
        // the frame actually carries ink beyond its own ground.
        const order = cands.map((c, k) => k).sort((a, b) => scores[b] - scores[a]);
        const el = await page.$("[data-om-exportable-video-with-duration-secs]");
        const seek = (tt) => page.evaluate((x) => document.querySelector("[data-om-exportable-video-with-duration-secs]")
          .dispatchEvent(new CustomEvent("data-om-seek-to-time-frame", { detail: { time: x, sync: true } })), tt);
        let best = order[0], png = null, ink = 0;
        for (const k of order) {
          await seek(cands[k].t);                    // sync:true, or the shot races the commit
          const shot = await el.screenshot({ type: "png" });
          const cover = await inkCoverage(sharp, shot);
          if (cover > ink) { ink = cover; best = k; png = shot; }
          if (cover >= MIN_INK) { best = k; png = shot; ink = cover; break; }
        }
        const { t, scene } = cands[best];
        const out = path.join(OUT_DIR, `${tpl.id}.jpg`);
        await sharp(png).resize(POSTER_W).jpeg({ quality: 82, progressive: true }).toFile(out);
        const kb = (fs.statSync(out).size / 1024).toFixed(0);
        console.log(`  ${tpl.id.padEnd(17)} ${String(t).padStart(6)}s  ${scene.padEnd(13)} ${String(kb).padStart(3)} KB   type ${String(scores[best]).padStart(3)}   ink ${(ink * 100).toFixed(1).padStart(4)}%`);
        made++;
      } catch (e) {
        console.error(`  ${tpl.id.padEnd(17)} FAILED: ${String(e.message).slice(0, 120)}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
  console.log(`\n${made}/${todo.length} posters written to public/longform/`);
  process.exit(made === todo.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
