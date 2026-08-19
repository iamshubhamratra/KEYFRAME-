#!/usr/bin/env node
// PHASE-0 REPORT GENERATOR — turns the scoring workflows' journals into FILMKIT-PHASE0-REPORT.md.
//
// Reads every {"type":"result"} line from the workflow journals (the authoritative per-agent
// record), de-dupes by pack (later runs win — a resumed run re-scores nothing it already had, and
// a verified result supersedes an unverified one for the same slug), and emits the scored table
// plus the divergence taxonomy.
//
//   node scripts/phase0-report.js [--out ../FILMKIT-PHASE0-REPORT.md]

const fs = require("node:fs");
const path = require("node:path");

const SUB = path.join(process.env.USERPROFILE || process.env.HOME || "", ".claude", "projects",
  "C--digital-guru-internship-teamkey-keyframe-KEYFRAME-", "16afdc13-60c9-4e9d-b2fd-3931a5166b88",
  "subagents", "workflows");
const FRAMECHECK = path.join(__dirname, "..", "framecheck");

function journals() {
  const out = [];
  try {
    for (const d of fs.readdirSync(SUB)) {
      const j = path.join(SUB, d, "journal.jsonl");
      if (fs.existsSync(j)) out.push(j);
    }
  } catch { /* none */ }
  return out;
}

function loadResults() {
  const bySlug = new Map();
  for (const f of journals()) {
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      const r = j && j.type === "result" && j.result;
      if (!r || !r.slug || !r.scores) continue;
      // A verified result always supersedes an unverified one for the same pack.
      const prev = bySlug.get(r.slug);
      if (!prev || (r.verified && !prev.verified)) bySlug.set(r.slug, r);
    }
  }
  return [...bySlug.values()];
}

// Recurring-defect buckets. Each is a signature over the auditors' own prose; a finding can land
// in more than one bucket, which is intended — the point is which ENGINE behaviour to fix, and one
// sentence can evidence two.
const BUCKETS = [
  ["T1  copy dropped (subtext/chips/captions)", /missing entirely|is dropped|are dropped|is lost|are lost|absent|is missing|are missing|disappears|no replacement copy/i],
  ["T2  montage grid collapsed", /montage|2x2|2×2|four (captioned )?slots?|grid.*(collaps|single)/i],
  ["T3  wrap shape broken by growth", /wrap shape|wrap changes|re-?wraps?|broke the wrap|3 lines|three lines|two lines vs|reflow/i],
  ["T4  text clipped / overflows frame", /clip|off the right|off-?canvas|off the frame|bleeds|overflow|safe-?area/i],
  ["T5  label truncated with ellipsis", /truncat|ellipsis|…/i],
  ["T6  mechanic mid-state pacing off", /behind reference|mid-type|lag|progress.*(differ|behind|earlier|later)|state differs|apparent progress/i],
  ["T7  badge icon invisible off scene 1", /badge.*(empty|missing|glyph|invisible)|glyph missing/i],
  ["T8  world progress-props run fast", /world[- ]phase|phase mismatch|pose|padlock|unlocks earlier/i],
  ["T9  accent hue / two-tone lost", /accent.*(swap|instead of|hue|missing)|entire headline cream|rendered cream|two-?tone/i],
  ["T10 number formatting", /thousands|separator|suffix.*(full-?size|smaller)|1,\d{3}/i],
  ["T11 ghost fallback copy on screen", /'?Metric'?|fallback label|generic placeholder copy/i],
  ["T12 ring/stat value line missing", /value (line|column)|second value|sub-?stat|43:12/i],
];

function taxonomy(results) {
  const rows = [];
  for (const [name, re] of BUCKETS) {
    let findings = 0; const packs = new Set();
    for (const r of results) {
      for (const d of r.divergences || []) {
        if (d.knownDeliberate) continue;
        if (re.test(d.description || "")) { findings++; packs.add(r.slug); }
      }
    }
    rows.push({ name, findings, packs: packs.size });
  }
  rows.sort((a, b) => b.packs - a.packs || b.findings - a.findings);
  return rows;
}

function catTotals(results) {
  const cats = {};
  for (const r of results) {
    for (const d of r.divergences || []) {
      if (d.knownDeliberate) continue;
      const k = `${d.category}/${d.severity}`;
      cats[k] = (cats[k] || 0) + 1;
    }
  }
  return Object.entries(cats).sort((a, b) => b[1] - a[1]);
}

function dimensionMeans(results) {
  const keys = ["layout", "typography", "color", "animation", "transitions", "assets", "composition"];
  const max = { layout: 20, typography: 15, color: 15, animation: 20, transitions: 10, assets: 10, composition: 10 };
  return keys.map((k) => {
    const vals = results.map((r) => Number(r.scores[k])).filter(Number.isFinite);
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    return { k, mean, max: max[k], pct: (mean / max[k]) * 100 };
  }).sort((a, b) => a.pct - b.pct);
}

function main() {
  const outArg = process.argv.indexOf("--out");
  const OUT = outArg > -1 ? process.argv[outArg + 1] : path.join(__dirname, "..", "..", "FILMKIT-PHASE0-REPORT.md");
  const results = loadResults();
  if (!results.length) { console.error("no results found in workflow journals"); process.exit(1); }
  results.sort((a, b) => b.total - a.total);
  const inv = JSON.parse(fs.readFileSync(path.join(FRAMECHECK, "phase0-inventory.json"), "utf8"));

  const mean = (results.reduce((a, r) => a + r.total, 0) / results.length).toFixed(1);
  const band = (lo, hi) => results.filter((r) => r.total >= lo && r.total <= hi).length;
  const verified = results.filter((r) => r.verified).length;
  const unscored = inv.covered.filter((s) => !results.some((r) => r.slug === s));

  const L = [];
  L.push(`# FilmKit Phase 0 — strict-parity measurement report`);
  L.push("");
  L.push(`**Generated:** \`node scripts/phase0-report.js\` · **packs scored: ${results.length}/${inv.covered.length}** (${verified} adversarially verified)`);
  L.push("");
  L.push(`Rubric: layout /20 · typography /15 · color /15 · animation /20 · transitions /10 · assets /10 · composition /10.`);
  L.push(`Anchor: robot-factory ≈ 91 (post-fix state). Known-deliberate deviations (wireframe plates instead of`);
  L.push(`"DROP IMAGE" placeholders, headline growth preserving wrap, mechanic↔statement routing alternation,`);
  L.push(`the 12-scene cap, per-job camera rotation) are tagged and NOT deducted.`);
  L.push("");
  L.push(`**Mean ${mean}/100** · ≥90: ${band(90, 100)} · 80–89: ${band(80, 89)} · 70–79: ${band(70, 79)} · 60–69: ${band(60, 69)} · <60: ${band(0, 59)}`);
  if (unscored.length) L.push(`\nNot yet scored (${unscored.length}): ${unscored.join(", ")}`);
  L.push("");

  L.push(`## 1. Inventory`);
  L.push("");
  L.push(`| Set | Count | Notes |`);
  L.push(`|---|---|---|`);
  L.push(`| Standalone references | ${inv.standalones.length} | \`templete-design/keyframe-handoff/standalone/\` |`);
  L.push(`| Installed \`film-*\` packs | ${inv.filmPacks.length} | \`frames/*/pack.json\` |`);
  L.push(`| **Measurable pairs** | **${inv.covered.length}** | the audit population |`);
  L.push(`| References with no film pack | ${inv.refNoPack.length} | ${inv.refNoPack.join(", ")} — all served by the out-of-scope \`om_stage\` family (hand-built one-offs, not FilmKit configs). Not orphans. |`);
  L.push(`| Packs with no reference | ${inv.packNoRef.length} | ${inv.packNoRef.map((p) => p.name).join(", ")} — admin-generated templates; no Claude-Design source exists to measure against. |`);
  L.push(`| Skins with no installed pack | ${inv.skinNoPack.length} | ${inv.skinNoPack.join(", ")} — drafts under \`frames_draft/\`. |`);
  L.push(`| Reference broken as shipped | 1 | **ink-and-panel** — a straight apostrophe inside its single-quoted \`OM_SCENES\` string (\`'Took you long enough.'\`) terminates the deck; the film never mounts in any browser ("the scenes prop isn't a valid JSON scene list"). Unmeasurable until the source drop is fixed. Our pack is unaffected (skins extract from \`source/mega-pack-*.js\`). |`);
  L.push("");

  L.push(`## 2. Harness verification`);
  L.push("");
  L.push(`- \`shot-film-reference.js\` (reference, via the exporter's \`data-om-seek-to-time-frame\` sync-seek contract) and`);
  L.push(`  \`shot-film-pack.js\` (ours, seeking \`window.__timelines["vid"]\` with \`suppressEvents:false\`) verified on`);
  L.push(`  robot-factory: **identical deck copy, identical scene-midpoint timestamps to the hundredth, identical`);
  L.push(`  1080×1920 viewport**, both sides deterministic.`);
  L.push(`- Captures on disk: 88/89 per side, 12 pairs/pack. Only ink-and-panel missing (above).`);
  L.push(`- Structural caveat, scored globally not per scene: **the engine caps films at 12 scenes** while reference`);
  L.push(`  decks run 14–18, so reference scenes 13+ have no partner and the film's CTA ending occupies slot 12.`);
  L.push("");

  L.push(`## 3. Scores`);
  L.push("");
  L.push(`| Pack | Total | lay/20 | typ/15 | col/15 | anim/20 | trans/10 | asset/10 | comp/10 | V |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const s = r.scores;
    L.push(`| ${r.slug} | **${r.total}** | ${s.layout} | ${s.typography} | ${s.color} | ${s.animation} | ${s.transitions} | ${s.assets} | ${s.composition} | ${r.verified ? "✓" : ""} |`);
  }
  L.push("");

  L.push(`### Weakest dimensions (mean as % of budget)`);
  L.push("");
  L.push(`| Dimension | Mean | Budget | % |`);
  L.push(`|---|---|---|---|`);
  for (const d of dimensionMeans(results)) L.push(`| ${d.k} | ${d.mean.toFixed(1)} | ${d.max} | ${d.pct.toFixed(0)}% |`);
  L.push("");

  L.push(`## 4. Divergence taxonomy (non-deliberate findings only)`);
  L.push("");
  L.push(`| Bucket | Packs affected | Findings |`);
  L.push(`|---|---|---|`);
  for (const t of taxonomy(results)) L.push(`| ${t.name} | ${t.packs}/${results.length} | ${t.findings} |`);
  L.push("");
  L.push(`Raw category × severity counts:`);
  L.push("");
  L.push("```");
  for (const [k, n] of catTotals(results)) L.push(`${k.padEnd(24)} ${n}`);
  L.push("```");
  L.push("");

  L.push(`## 5. Confirmed root causes (read in code, not inferred)`);
  L.push("");
  L.push(`| # | Root cause | Site | Fix lands in |`);
  L.push(`|---|---|---|---|`);
  L.push(`| T3+T4 | **One average glyph-advance number per skin** (\`skin.em\`, 25 distinct values across 104 skins, range 0.40–1.00) is used to model line width, so the fitter wraps where a real browser would not; solo-growth then amplifies the error until lines clip the frame. A single average cannot predict a real wrap point. | \`film_stage.js:380\` (\`per = em + track\`), \`film_beats.js:153\` | engine + a generated **measured** width table (same pattern as \`gen-pack-fonts.js\`) |`);
  L.push(`| T1 | Beat builders read a fixed number of lines (\`featureLines(scene, 1..7)\`) and discard the rest; a re-routed beat keeps 1 line and drops the scene's remaining authored copy. | \`film_beats.js\` 400, 492, 668, 732, 786, 965, 1018, 1076, 1129, 1175, 1246 | engine (builders + routing) |`);
  L.push(`| T2 | Montage tile count is \`min(shots.length, 4)\` — with no assets in hand the 2×2 wall degrades to one plate, where the reference always draws its four captioned slots. | \`film_beats.js:488\` | **product decision** (conflicts with the no-empty-container law) |`);
  L.push(`| T5 | \`shortLabel\` hard-caps at \`LABEL_MAX = 28\` chars and appends "…" instead of fitting the full label. | \`film_stage.js:313-314\` | engine |`);
  L.push(`| T7 | The chrome badge icon is baked **once** at build time against scene 1's ground (\`renderIcon(skin, theme, grounds[0], chromeFg)\`), while the seek proxy swaps only the disc colour per beat (\`badgeEl.style.background = fgs[si]\`). On any later beat the icon still strokes in scene 1's ground colour — frequently the same value as the new disc, so it vanishes. | \`film_stage.js:1112\` + \`:1170\` | engine (emit one icon variant per distinct ground/fg pair, toggle per scene) |`);
  L.push(`| T8 | The World receives \`progress = now / OUR_duration\` (\`FK_WORLD(now*AMB, now/D)\`), but our film is shorter than the reference's (12-scene cap), so **progress-driven** world elements advance faster than the reference's while **time-driven** ones stay in phase — exactly the split the auditors observed. | \`film_stage.js:1164\`, \`:1253\` | engine — but **which denominator is correct is a design question** (match the reference's absolute pose and never render its final third, or keep the world's arc spanning our film). Needs a ruling. |`);
  L.push(`| T10 | \`pickNumber\`/\`pickStats\` strip thousands separators when parsing (\`replace(/,/g,"")\`) and re-emit the bare integer, so "1,290m" renders "1290m"; the unit also renders at full display size in some beats where the reference sets it smaller. | \`film_stage.js:305, 326, 328\` | engine |`);
  L.push(`| T11 | Four builders fall back to the literal string \`Str.metric\` ("Metric") when a scene yields no lines, putting placeholder copy on screen — a violation of the repo's own never-invent law. | \`film_beats.js:791, 966, 1019\` (+1) | engine |`);
  L.push(`| T12 | The Ring/Stats second value line has no storyboard carrier: the label comes only from \`scene.emphasis\` or the parsed stat label, and the label≡sub dedup can suppress a legitimate one. | \`film_beats.js:883\` | engine (+ possibly a storyboard field) |`);
  L.push(`| T6 | Mechanic progress windows (\`a\`/\`b\` budgets per variant) do not match the reference's per-variant \`seg()\` curves for every variant; needs a per-variant trace of \`film_runtime.js\` against \`film-kit.js\`. | \`film_runtime.js\` | engine (per-variant) |`);
  L.push(`| T9 | Two-tone accent loss/swap arises from the interaction of routing (a mechanic beat reads the \`app\` look, not the beat look), the physical-vs-logical line rule in \`hiFor\`, and the display contrast floor. Needs a per-pack code trace. | \`film_beats.js\` title()/routing | engine (trace first) |`);
  L.push("");

  L.push(`## 6. What Phase 0 does not conclude`);
  L.push("");
  L.push(`- Unverified rows may move a few points once the adversarial pass completes (mostly upward, where a`);
  L.push(`  scorer deducted for the consequences of a tagged deliberate reroute).`);
  L.push(`- The harness runs a **bare deck (no assets)**, which exaggerates T2 relative to production films that`);
  L.push(`  carry real pictures into those slots. A with-assets pass would size T2's true product impact.`);
  L.push(`- Two items need an owner's ruling before they can be "fixed": **T2** (empty montage grid vs the`);
  L.push(`  no-empty-container law) and **T8** (which duration the World's progress should span).`);
  L.push(`- No engine changes were made in Phase 0.`);
  L.push("");

  L.push(`## 7. Recommended fix order for Phase 2`);
  L.push("");
  L.push(`1. **T3+T4** — one root (real font metrics). Largest score effect; fixes clipping and wrap shape together.`);
  L.push(`2. **T1** — copy retention in builders/routing: the single biggest content-fidelity loss.`);
  L.push(`3. **T5**, **T11**, **T10** — small, self-contained, and T11 violates a stated repo law.`);
  L.push(`4. **T7** — mechanical, fully understood, regression from the badge fix.`);
  L.push(`5. **T9**, **T12**, **T6** — need traces first.`);
  L.push(`6. **T2**, **T8** — blocked on decisions.`);
  L.push("");

  fs.writeFileSync(OUT, L.join("\n"), "utf8");
  console.log(`wrote ${OUT} — ${results.length} packs, mean ${mean}, ${verified} verified`);
}

if (require.main === module) main();
