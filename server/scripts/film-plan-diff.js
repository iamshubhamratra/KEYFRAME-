#!/usr/bin/env node
// FILM-PLAN-DIFF — compare the BEAT PLAN our engine chooses against the reference deck's own
// scene sequence, for every FilmKit pack, without rendering a pixel.
//
// WHY. The vision scoring pass is slow and expensive, and it kept catching the same class of
// defect: our engine drawing a Montage wall where the reference draws its Scroll manifest, or a
// Scroll list where the reference draws its Montage wall. That is a COMPOSITION decision made in
// film_stage's mechanic router, and it is knowable from the emitted markup alone — every scene
// now names its builder in `data-fk-beat`. So this reads the reference deck (captured by
// shot-film-reference.js), builds the same storyboard shot-film-pack.js would, and diffs the two
// sequences.
//
//   node scripts/film-plan-diff.js                 # every captured pack, summary + worst offenders
//   node scripts/film-plan-diff.js alpine-post -v  # per-scene table for one pack
//
// The score is not a fidelity score — a pack can agree on every beat and still look wrong. It is
// the floor: disagree here and no amount of typography will make the frame match.

const fs = require("node:fs");
const path = require("node:path");
const { storyboardFromRef } = require("./shot-film-pack.js");

const REF_ROOT = path.join(__dirname, "..", "framecheck", "film-ref");

// The reference's scene NAME -> the beat we consider a faithful expression of it. A reference
// Scroll may legitimately land on our `scroll` mechanic; a reference Montage on our `montage`.
// Anything else is a substitution and counts against the pack.
const OK_FOR = {
  Hook: ["hook"], CTA: ["cta"], Statement: ["statement"], Stats: ["stats"],
  Feature: ["feature"], Montage: ["montage"],
  Ring: ["ring"], Scroll: ["scroll"], Swipe: ["swipe"], Morph: ["morph"],
  Notify: ["notify"], Toggle: ["toggle"], Typing: ["typing"], Code: ["code"],
  Cursor: ["cursor"], DragDrop: ["dragdrop"],
};

function planFor(slug, maxScenes = 12, { treatment = false } = {}) {
  const metaPath = path.join(REF_ROOT, slug, "meta.json");
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  meta.slug = slug;
  const skinMod = require(path.join(__dirname, "..", "src", "services", "film_skins", `${slug.replace(/-/g, "_")}.js`));
  const sb = storyboardFromRef(meta, maxScenes, { treatment });
  const { indexHtml } = skinMod.buildComposition({
    storyboard: sb, dims: { width: 1080, height: 1920, fps: 30 },
    framePack: slug, captionCues: [], assets: [], localized: sb.ctaUrl ? { ctaUrl: sb.ctaUrl } : null,
    seedKey: "fidelity",
  });
  const beats = [...indexHtml.matchAll(/data-fk-beat="([^"]*)"/g)].map((m) => m[1]);
  return { sb, beats, declared: skinMod.SKIN ? skinMod.SKIN.variants : null };
}

function main() {
  const argv = process.argv.slice(2);
  const verbose = argv.includes("-v") || argv.includes("--verbose");
  let slugs = argv.filter((a) => !a.startsWith("-"));
  if (!slugs.length) slugs = fs.readdirSync(REF_ROOT).filter((d) => fs.existsSync(path.join(REF_ROOT, d, "meta.json"))).sort();

  const rows = [];
  for (const slug of slugs) {
    let p; try { p = planFor(slug, 12, { treatment: argv.includes("--treatment") }); } catch (e) { console.error(`${slug}: ${String(e.message).slice(0, 120)}`); continue; }
    if (!p) { console.error(`${slug}: no reference capture`); continue; }
    const want = p.sb.scenes.map((s) => s.refName);
    const got = p.beats.map((b) => String(b).toLowerCase());
    // THE LAST SLOT IS NOT A SUBSTITUTION. Every film ends on its CTA, and the 12-scene cap pulls
    // that ending forward out of a 14-18 scene reference deck, so the final slot always disagrees
    // by construction. Counting it would charge every pack for one known structural gap.
    const cmp = want.length - 1;
    let hit = 0; const misses = [];
    want.slice(0, cmp).forEach((w, i) => {
      const ok = (OK_FOR[w] || []).some((k) => k === got[i]);
      if (ok) hit++; else misses.push(`${i + 1}:${w}->${got[i] || "?"}`);
    });
    // WHAT THE ENGINE CAN ACTUALLY CONTROL.
    //
    // Slot agreement is bounded above by the harness itself: a reference Scroll and a reference
    // Montage both reach the engine as `purpose: showcase`, and a Toggle and a Statement both as
    // `kind: quote` — identical inputs, so the router cannot tell them apart and half of those
    // slots are a coin toss. What it CAN control is the MIX: how many beats of the film speak the
    // pack's interaction vocabulary, and how much of that vocabulary appears at all. Those two
    // are the numbers that moved when the router was wrong in either direction.
    const MECHS = new Set(Object.keys(OK_FOR).filter((k) => !["Hook", "CTA", "Statement", "Stats", "Feature", "Montage"].includes(k)).map((k) => k.toLowerCase()));
    const refMech = want.slice(0, cmp).filter((w) => MECHS.has(w.toLowerCase()));
    const ourMechAll = got.slice(0, cmp).filter((b) => MECHS.has(b));
    const refVocab = new Set(refMech.map((w) => w.toLowerCase()));
    const ourVocab = new Set(ourMechAll);
    const covered = [...refVocab].filter((k) => ourVocab.has(k)).length;
    rows.push({
      slug, n: cmp, hit, pct: Math.round((hit / cmp) * 100), misses,
      refMechN: refMech.length, ourMechN: ourMechAll.length,
      refVocab: refVocab.size, covered,
    });
    if (verbose) {
      console.log(`\n${slug}  ${hit}/${want.length} (${Math.round((hit / want.length) * 100)}%)`);
      want.forEach((w, i) => console.log(`  ${String(i + 1).padStart(2)}  ref ${w.padEnd(12)} ours ${(got[i] || "?").padEnd(12)} ${i >= cmp ? "  (cap: film ends on its CTA)" : (OK_FOR[w] || []).some((k) => k === got[i]) ? "" : "  <-- substituted"}`));
    }
  }
  rows.sort((a, b) => a.pct - b.pct);
  if (!verbose) {
    for (const r of rows) {
      console.log(`${String(r.pct).padStart(3)}%  ${r.slug.padEnd(22)} ${r.hit}/${r.n}  mech ${r.ourMechN}/${r.refMechN}  vocab ${r.covered}/${r.refVocab}  ${r.misses.slice(0, 5).join(" ")}`);
    }
  }
  const avg = rows.reduce((a, r) => a + r.pct, 0) / (rows.length || 1);
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const vocab = sum((r) => r.covered) / Math.max(1, sum((r) => r.refVocab));
  console.log(`
${rows.length} pack(s) · beat agreement ${avg.toFixed(1)}% (bounded — see note)`
    + ` · mechanic beats ${sum((r) => r.ourMechN)} ours vs ${sum((r) => r.refMechN)} reference`
    + ` · vocabulary present ${(vocab * 100).toFixed(1)}%`);
  fs.writeFileSync(path.join(__dirname, "..", "framecheck", "plan-diff.json"), JSON.stringify(rows, null, 1));
}

if (require.main === module) main();
module.exports = { planFor };
