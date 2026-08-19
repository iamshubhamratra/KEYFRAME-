#!/usr/bin/env node
// GEN-FONT-METRICS — measure REAL per-character advance widths for every bundled face and emit
// src/fonts/font_metrics.js.
//
// WHY THIS EXISTS. film_stage.fitLines decides where a display line breaks, and it modelled the
// line with ONE average advance per skin (`skin.em`, 25 distinct values across 104 skins, range
// 0.40-1.00). A single average cannot predict a real wrap point: in Anton "I" is ~0.24em and "W"
// ~0.90em, so a headline of narrow glyphs is over-measured (breaks early — the reference's two
// lines become three) and one of wide glyphs is under-measured (the line overflows and the browser
// breaks it anyway, or it clips the frame). Measured across the library that single approximation
// was the root cause of the two largest fidelity buckets at once: wrap-shape divergence in 37 of
// 48 audited packs and edge-clipping in 18.
//
// The fitter emits ONE <div> per line, so its own wrap decision is what the viewer sees — the
// browser only re-wraps when a line genuinely overflows. Give the fitter the browser's own numbers
// and the two agree.
//
// HOW. Headless Chrome loads each face from the same base64 data URI the films ship, then
// canvas measureText() reports each character's advance at a known size. Per-character sums lose
// kerning, so each family also gets a KERN factor: the ratio of a measured pangram's real width to
// the sum of its per-character widths. Deterministic (same font bytes -> same numbers), run once,
// committed — exactly the contract gen-pack-fonts.js already has.
//
//   node scripts/gen-font-metrics.js            # write src/fonts/font_metrics.js
//   node scripts/gen-font-metrics.js --check    # verify the committed table matches the fonts

const fs = require("node:fs");
const path = require("node:path");

const { FONT_FACES } = require("../src/fonts/pack_fonts");
// MEASURE EACH FAMILY AT THE WEIGHT IT WILL ACTUALLY RENDER. 21 of the library's families were
// never requested by their designs below 400 (see scripts/font-axis-survey.js), so film_beats
// draws their display type at that floor — and a heavier cut is WIDER. Measuring them at the CSS
// default would hand fitLines numbers for a weight the film never shows, which is the same class
// of defect as the frozen optical-size axis: the fitter and the browser disagreeing about the
// same string. kernel-black overflowed the frame the moment the floor landed.
const { weightFloor } = require("../src/fonts/font_weights");
const OUT = path.join(__dirname, "..", "src", "fonts", "font_metrics.js");

// The characters a film's display type can actually contain. Printable ASCII covers authored copy;
// the typographic set covers what the script model and localization emit (curly quotes, dashes,
// ellipsis, middot) and the currency/accent set covers stats and European copy. Anything outside
// this falls back to the family's average, which is the old behaviour and no worse.
const CHARS = (() => {
  const out = [];
  for (let c = 0x20; c <= 0x7e; c++) out.push(String.fromCharCode(c));
  for (const ch of "—–’‘“”…·°€£₹¥éèêëáàâäãåíìîïóòôöõúùûüñçßøæœ") out.push(ch);
  return out;
})();
const PANGRAM = "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 0123456789";
const SIZE = 200; // large enough that sub-pixel rounding is negligible at 3 decimals

function findChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const root = path.join(home, ".cache", "puppeteer", "chrome");
  const out = [];
  try {
    for (const dir of fs.readdirSync(root)) {
      for (const sub of ["chrome-win64/chrome.exe", "chrome-linux64/chrome",
        "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"]) {
        const exe = path.join(root, dir, sub);
        if (fs.existsSync(exe)) out.push(exe);
      }
    }
  } catch { /* no cache */ }
  return out.sort().reverse()[0] || null;
}

async function measureAll() {
  const puppeteer = require("puppeteer-core");
  const exe = findChromium();
  if (!exe) throw new Error("no cached Chrome found — set PUPPETEER_EXECUTABLE_PATH");
  const browser = await puppeteer.launch({
    executablePath: exe, headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none", "--force-color-profile=srgb"],
  });
  const families = Object.keys(FONT_FACES);
  const out = {};
  try {
    const page = await browser.newPage();
    // ONE page carrying every face: families are measured by name, so a single document with all
    // @font-face rules is both faster and immune to per-page font-cache differences.
    const css = families.map((f) => FONT_FACES[f]).join("\n");
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body></body></html>`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    for (const family of families) {
      const wt = weightFloor(family) || 400;
      const m = await page.evaluate(async (fam, chars, pangram, size, weight) => {
        // Force the face to load before measuring; an unloaded face silently measures as a
        // fallback and would bake the WRONG numbers into the table.
        await document.fonts.load(`${weight} ${size}px '${fam}'`);
        await document.fonts.load(`bold ${size}px '${fam}'`);
        const cv = document.createElement("canvas");
        const ctx = cv.getContext("2d");
        ctx.font = `${weight} ${size}px '${fam}'`;
        const loaded = document.fonts.check(`${weight} ${size}px '${fam}'`);
        const widths = {};
        for (const ch of chars) widths[ch] = +(ctx.measureText(ch).width / size).toFixed(4);
        const real = ctx.measureText(pangram).width / size;
        const summed = [...pangram].reduce((a, ch) => a + (widths[ch] || 0), 0);
        return { widths, loaded, kern: summed > 0 ? +(real / summed).toFixed(4) : 1 };
      }, family, CHARS, PANGRAM, SIZE, wt);
      if (!m.loaded) { console.warn(`  !! ${family}: face did not load — SKIPPED (would have measured a fallback)`); continue; }
      // The average over A-Z0-9 is the fallback for characters outside the measured set, and the
      // number a skin's hand-tuned `em` was trying to approximate.
      const keys = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
      const avg = +(keys.reduce((a, k) => a + (m.widths[k] || 0), 0) / keys.length).toFixed(4);
      out[family] = { avg, kern: m.kern, widths: m.widths };
      console.log(`  ${family.padEnd(26)} avg ${avg.toFixed(3)}  kern ${m.kern.toFixed(3)}${wt !== 400 ? `  @${wt}` : ""}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}

function emit(metrics) {
  const fams = Object.keys(metrics).sort();
  const body = fams.map((f) => {
    const m = metrics[f];
    return `  ${JSON.stringify(f)}: { avg: ${m.avg}, kern: ${m.kern}, w: ${JSON.stringify(m.widths)} },`;
  }).join("\n");
  return `// AUTO-GENERATED by scripts/gen-font-metrics.js — committed on purpose. DO NOT hand-edit.
//
// Real per-character advance widths (in em) for every bundled face, measured in headless Chrome
// from the same base64 font bytes the films ship. film_stage.fitLines uses these instead of a
// single average-advance guess per skin, so its wrap decision matches what the browser will
// actually do — see the generator's header for why that was the library's largest fidelity defect.
//
//   avg   average advance over A-Z0-9 — the fallback for unmeasured characters
//   kern  measured pangram width / sum of its per-character widths (per-character sums lose
//         kerning; this restores it on average)
//   w     per-character advance, em
//
// Regenerate: node scripts/gen-font-metrics.js   ·   Verify: --check (npm run test:font-metrics)

const METRICS = {
${body}
};

// Advance of one string in em, at the family's real widths. \`track\` is letter-spacing in em,
// which applies to every character. Unknown family or character falls back to \`avg\`, which is
// the pre-metrics behaviour and never worse.
function advanceEm(text, family, { track = 0, avg = 0.6 } = {}) {
  const m = METRICS[family];
  const table = m ? m.w : null;
  const fallback = m ? m.avg : avg;
  let a = 0;
  for (const ch of String(text || "")) {
    const w = table && table[ch] !== undefined ? table[ch] : fallback;
    a += w + Math.max(0, Number(track) || 0);
  }
  return m ? a * m.kern : a;
}

function metricsFor(family) { return METRICS[family] || null; }
function hasMetrics(family) { return !!METRICS[family]; }

module.exports = { METRICS, advanceEm, metricsFor, hasMetrics };
`;
}

async function main() {
  const check = process.argv.includes("--check");
  console.log(`[font-metrics] measuring ${Object.keys(FONT_FACES).length} bundled face(s)…`);
  const metrics = await measureAll();
  const next = emit(metrics);
  if (check) {
    const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (prev === next) { console.log(`[font-metrics] OK — committed table matches the bundled fonts (${Object.keys(metrics).length} families)`); process.exit(0); }
    console.error(`[font-metrics] DRIFT — src/fonts/font_metrics.js does not match the bundled fonts. Re-run without --check.`);
    process.exit(1);
  }
  fs.writeFileSync(OUT, next, "utf8");
  console.log(`[font-metrics] wrote ${path.relative(process.cwd(), OUT)} — ${Object.keys(metrics).length} families, ${CHARS.length} chars each`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
