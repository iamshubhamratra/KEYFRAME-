#!/usr/bin/env node
// LINT-READING-BUDGET — fail the build when a beat is on screen for less time
// than a reader needs to read it.
//
//   node scripts/lint-reading-budget.js "Margin Notes.dc.html" [more...]
//   node scripts/lint-reading-budget.js --wpm 250 --overlay   # print the overlay table
//
// Budget: words / (wpm / 60) + LAND seconds. LAND is the beat a line needs to
// settle before it leaves; without it a paragraph that technically "fits" still
// reads as a flash. Counts every field a renderer puts on screen — title, sub,
// body, quote, attrib, kicker, note, chips, tiles, items, stat labels — and
// ignores fields that never render (fallbackText is counted only for a beat
// whose media slot is empty, because that is when it is shown).

const fs = require("node:fs");

const ARGS = process.argv.slice(2);
const WPM = Number((ARGS.find((a) => a.startsWith("--wpm=")) || "").split("=")[1]) || 225;
const LAND = 1.2;
const OVERLAY = ARGS.includes("--overlay");
const FILES = ARGS.filter((a) => !a.startsWith("--"));

const words = (v) => String(v == null ? "" : v).replace(/\|/g, " ").trim().split(/\s+/).filter(Boolean).length;

function beatWords(s) {
  let n = 0;
  for (const k of ["kicker", "title", "sub", "body", "quote", "attrib", "note", "label", "prompt", "text", "cta", "url"]) n += words(s[k]);
  for (const k of ["chips", "tiles"]) if (Array.isArray(s[k])) n += s[k].reduce((a, v) => a + words(v), 0);
  if (Array.isArray(s.items)) n += s.items.reduce((a, v) => a + words(v.t) + words(v.v), 0);
  if (Array.isArray(s.stats)) n += s.stats.reduce((a, v) => a + words(v.label) + 1, 0);
  const slot = ("image" in s) || ("images" in s);
  const empty = !s.image && !((s.images || []).some(Boolean));
  if (slot && empty && s.fallbackText) n += words(s.fallbackText);
  return n;
}

// A wrapper declares its beats one of two ways: the pilot inlines a quoted JSON
// literal, and the other 49 point at a shared cohort article
// (`window.OM_SCENES = window.ARTICLE_SCRIPTS.tech`) so five packs render the same
// words and the differentiation is visibly the design. Reading only the literal
// form reported "no window.OM_SCENES found" for 49 of 50 files — the lint was
// blind to the exact case it most needed to check.
let SCRIPTS = null;
function articleScripts(file) {
  if (SCRIPTS) return SCRIPTS;
  const here = require("node:path").dirname(file);
  for (const rel of ["../configs/article-scripts.js", "configs/article-scripts.js", "./article-scripts.js"]) {
    const p = require("node:path").resolve(here, rel);
    if (!fs.existsSync(p)) continue;
    const sandbox = { window: {} };
    require("node:vm").createContext(sandbox);
    require("node:vm").runInContext(fs.readFileSync(p, "utf8"), sandbox, { timeout: 10000 });
    if (sandbox.window.ARTICLE_SCRIPTS) return (SCRIPTS = sandbox.window.ARTICLE_SCRIPTS);
  }
  return (SCRIPTS = {});
}

function scenesFrom(file) {
  const src = fs.readFileSync(file, "utf8");
  const lit = src.match(/window\.OM_SCENES\s*=\s*'([\s\S]*?)';/);
  if (lit) return JSON.parse(lit[1]);
  const ref = src.match(/window\.OM_SCENES\s*=\s*window\.ARTICLE_SCRIPTS\.([A-Za-z0-9_]+)/);
  if (ref) {
    const all = articleScripts(file);
    const raw = all[ref[1]];
    if (!raw) throw new Error(`${file}: ARTICLE_SCRIPTS.${ref[1]} not found in configs/article-scripts.js`);
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }
  throw new Error(`${file}: no window.OM_SCENES found`);
}

let failed = 0;
for (const file of FILES) {
  let scenes;
  try { scenes = scenesFrom(file); } catch (e) { console.error(`✗ ${e.message}`); failed++; continue; }
  const rows = scenes.map((s, i) => {
    const w = beatWords(s);
    const need = +(w / (WPM / 60) + LAND).toFixed(2);
    return { i: i + 1, name: s.name, words: w, dur: s.dur, need, slack: +(s.dur - need).toFixed(2) };
  });
  const total = rows.reduce((a, r) => a + r.dur, 0);
  const bad = rows.filter((r) => r.slack < 0);

  if (OVERLAY || bad.length) {
    console.log(`\n${file} — ${rows.length} beats, ${total.toFixed(1)}s, ${WPM} wpm + ${LAND}s land`);
    console.log("  #  beat        words   dur   need  slack");
    for (const r of rows) {
      console.log(`  ${String(r.i).padStart(2)}  ${r.name.padEnd(10)} ${String(r.words).padStart(5)} ${String(r.dur).padStart(5)} ${String(r.need).padStart(6)} ${String(r.slack).padStart(6)}${r.slack < 0 ? "  ✗" : ""}`);
    }
  }
  if (bad.length) {
    failed++;
    console.error(`✗ ${file}: ${bad.length} beat(s) under budget — ${bad.map((b) => `#${b.i} ${b.name} needs ${b.need}s`).join(", ")}`);
  } else {
    console.log(`✓ ${file}: every beat clears its reading budget (tightest slack ${Math.min(...rows.map((r) => r.slack)).toFixed(2)}s)`);
  }
}

process.exit(failed ? 1 : 0);
