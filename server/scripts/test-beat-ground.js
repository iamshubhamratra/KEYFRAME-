#!/usr/bin/env node
// GUARD — A BEAT MUST WEAR ITS OWN GROUND.
//
// Two rules downgrade a beat while the composition is being built: an empty montage wall becomes a
// feature, and a stats beat with nothing to count becomes a feature or a statement. The ground was
// resolved from the archetype BEFORE those downgrades while the foreground was resolved from the
// one AFTER, so a downgraded beat wore another beat's ground. On bonsai-bench that pairs the
// statement's `fg: paper` with the stats beat's `bg: paper` — paper on paper — and only the
// contrast floor saved it, repainting the type to ink and shipping the pack's dramatic pine-green
// type slab as a plain cream page.
//
// It shipped: production job ormyyok2un, scenes 4 and 5. The reference-deck harness cannot see it,
// because a reference Statement arrives as a statement and never needs downgrading — only a real
// storyboard, where a "proof" scene carries no figure, takes that path.
//
// THE INVARIANT: within one film, every scene drawn by the same builder wears the same ground.
//
//   node scripts/test-beat-ground.js

const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "src", "services", "film_skins");

// A storyboard built to FORCE the downgrades: one real statement, and two "proof" scenes whose
// copy carries no figure at all (so `stats` cannot count and falls back), plus a showcase scene
// with nothing to hang on the wall.
const SCENES = [
  { kind: "hook", purpose: "hook", headline: "The opener line" },
  { kind: "quote", purpose: "problem", headline: "A real statement beat", subtext: "One supporting line." },
  { kind: "stat", purpose: "proof", headline: "A proof beat with no number", subtext: "Nothing countable here." },
  { kind: "quote", purpose: "problem", headline: "Another statement beat", subtext: "Also supported." },
  { kind: "stat", purpose: "proof", headline: "Second figureless proof", subtext: "Still nothing to count." },
  { kind: "caption", purpose: "showcase", headline: "A wall with nothing on it" },
  { kind: "cta", purpose: "cta", headline: "The closer" },
].map((s, i) => ({ id: `s${i + 1}`, start: i * 3, duration: 3, ...s }));

const STORYBOARD = { title: "ground guard", durationSec: SCENES.length * 3, orientation: "portrait", scenes: SCENES };

let pass = 0, fail = 0;
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js") && !f.startsWith("_"));

for (const f of files) {
  const slug = f.replace(/\.js$/, "").replace(/_/g, "-");
  let html;
  try {
    const mod = require(path.join(DIR, f));
    if (!mod || typeof mod.buildComposition !== "function") continue;
    ({ indexHtml: html } = mod.buildComposition({
      storyboard: STORYBOARD, dims: { width: 1080, height: 1920, fps: 30 },
      framePack: slug, captionCues: [], assets: [], seedKey: "ground-guard",
    }));
  } catch (e) { console.log(`  ✗ ${slug}: build threw — ${String(e.message).slice(0, 100)}`); fail++; continue; }

  // Every scene wrapper carries its builder and, when the beat is opaque, its own background.
  const re = /<div class="clip fk-sc" id="(s\d+)" data-fk-beat="([^"]*)"[^>]*?style="opacity:0;(?:background:([^;]*);)?/g;
  const byBeat = new Map();
  let m;
  while ((m = re.exec(html))) {
    const [, id, beat, bg] = m;
    if (!bg) continue;                       // a transparent beat shows the world; nothing to compare
    if (!byBeat.has(beat)) byBeat.set(beat, []);
    byBeat.get(beat).push({ id, bg: bg.trim() });
  }
  const bad = [];
  for (const [beat, rows] of byBeat) {
    const distinct = [...new Set(rows.map((r) => r.bg))];
    if (distinct.length > 1) bad.push(`${beat}: ${rows.map((r) => `${r.id}=${r.bg}`).join(" ")}`);
  }
  if (bad.length) { console.log(`  ✗ ${slug}: same beat, different grounds — ${bad.join(" | ")}`); fail++; }
  else pass++;
}

console.log(`\n${pass} passed, ${fail} failed  (${files.length} pack(s) checked)`);
process.exit(fail ? 1 : 0);
