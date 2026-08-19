#!/usr/bin/env node
// PHASE-2 REPORT — before/after strict-parity scores for the FilmKit library.
//
// Pre-fix scores come from the Phase-0 scoring runs, post-fix from the re-score runs after the
// engine work; both used the same rubric, the same reference decks and the same timestamps, so the
// delta is attributable to the engine and nothing else. Run IDs are passed in rather than guessed,
// because "latest wins" would silently mix the two populations.
//
//   node scripts/phase2-report.js --pre wf_02050951-ca6,wf_ae712f7f-3a8 --post wf_94024a24-2d5,wf_b6604e06-e4c

const fs = require("node:fs");
const path = require("node:path");

const SUB = path.join(process.env.USERPROFILE || process.env.HOME || "", ".claude", "projects",
  "C--digital-guru-internship-teamkey-keyframe-KEYFRAME-", "16afdc13-60c9-4e9d-b2fd-3931a5166b88",
  "subagents", "workflows");
const FRAMECHECK = path.join(__dirname, "..", "framecheck");

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : dflt;
}

function loadRuns(ids) {
  const bySlug = new Map();
  for (const id of ids) {
    const j = path.join(SUB, id, "journal.jsonl");
    if (!fs.existsSync(j)) { console.warn(`[phase2] missing journal for ${id}`); continue; }
    for (const line of fs.readFileSync(j, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      const r = o && o.type === "result" && o.result;
      if (!r || !r.slug || !r.scores) continue;
      const prev = bySlug.get(r.slug);
      if (!prev || (r.verified && !prev.verified)) bySlug.set(r.slug, r);
    }
  }
  return bySlug;
}

const BUCKETS = [
  ["T1  copy dropped", /missing entirely|is dropped|are dropped|is lost|are lost|absent|is missing|are missing|disappears|no replacement copy/i],
  ["T2  montage grid collapsed", /montage|2x2|2×2|four (captioned )?slots?|grid.*(collaps|single)/i],
  ["T3  wrap shape broken", /wrap shape|wrap changes|re-?wraps?|broke the wrap|3 lines|three lines|two lines vs|reflow/i],
  ["T4  text clipped / overflow", /clip|off the right|off-?canvas|off the frame|bleeds|overflow|safe-?area/i],
  ["T5  label truncated", /truncat|ellipsis|…/i],
  ["T6  mechanic pacing", /behind reference|mid-type|lag|progress.*(differ|behind|earlier|later)|state differs|apparent progress/i],
  ["T7  badge icon invisible", /badge.*(empty|missing|glyph|invisible)|glyph missing/i],
  ["T8  world progress phase", /world[- ]phase|phase mismatch|pose|padlock|unlocks earlier/i],
  ["T9  accent / two-tone lost", /accent.*(swap|instead of|hue|missing)|entire headline cream|rendered cream|two-?tone/i],
  ["T10 number formatting", /thousands|separator|suffix.*(full-?size|smaller)|1,\d{3}/i],
  ["T11 ghost fallback copy", /'?Metric'?|fallback label|generic placeholder copy/i],
  ["T12 ring/stat value line", /value (line|column)|second value|sub-?stat|43:12/i],
];

function bucketCounts(map) {
  const rows = {};
  for (const [name, re] of BUCKETS) {
    let findings = 0; const packs = new Set();
    for (const r of map.values()) {
      for (const d of r.divergences || []) {
        if (d.knownDeliberate) continue;
        if (re.test(d.description || "")) { findings++; packs.add(r.slug); }
      }
    }
    rows[name] = { findings, packs: packs.size };
  }
  return rows;
}

const DIMS = [["layout", 20], ["typography", 15], ["color", 15], ["animation", 20], ["transitions", 10], ["assets", 10], ["composition", 10]];

function main() {
  const pre = loadRuns(String(arg("--pre", "")).split(",").filter(Boolean));
  const post = loadRuns(String(arg("--post", "")).split(",").filter(Boolean));
  if (!post.size) { console.error("no post-fix results found — pass --post <runId,...>"); process.exit(1); }

  const slugs = [...post.keys()].sort();
  const rows = slugs.map((s) => {
    const a = pre.get(s), b = post.get(s);
    return { slug: s, before: a ? a.total : null, after: b.total, verified: !!b.verified, scores: b.scores, divergences: b.divergences || [] };
  });
  const withBoth = rows.filter((r) => r.before != null);
  const meanBefore = withBoth.length ? withBoth.reduce((a, r) => a + r.before, 0) / withBoth.length : 0;
  const meanAfter = rows.reduce((a, r) => a + r.after, 0) / rows.length;
  const band = (arr, lo, hi, key) => arr.filter((r) => r[key] >= lo && r[key] <= hi).length;
  const improved = withBoth.filter((r) => r.after > r.before).length;
  const regressed = withBoth.filter((r) => r.after < r.before).length;

  const preB = bucketCounts(pre), postB = bucketCounts(post);

  const L = [];
  L.push(`# FilmKit strict-parity — final report (engine rev 4)`);
  L.push("");
  L.push(`**Generated:** \`node scripts/phase2-report.js\` · post-fix packs scored: **${rows.length}** (${rows.filter((r) => r.verified).length} adversarially verified) · pre-fix comparison available for ${withBoth.length}`);
  L.push("");
  L.push(`| | mean | ≥90 | 80–89 | 70–79 | 60–69 | <60 |`);
  L.push(`|---|---|---|---|---|---|---|`);
  L.push(`| **before** (rev 3) | ${meanBefore.toFixed(1)} | ${band(withBoth, 90, 100, "before")} | ${band(withBoth, 80, 89, "before")} | ${band(withBoth, 70, 79, "before")} | ${band(withBoth, 60, 69, "before")} | ${band(withBoth, 0, 59, "before")} |`);
  L.push(`| **after** (rev 4) | **${meanAfter.toFixed(1)}** | ${band(rows, 90, 100, "after")} | ${band(rows, 80, 89, "after")} | ${band(rows, 70, 79, "after")} | ${band(rows, 60, 69, "after")} | ${band(rows, 0, 59, "after")} |`);
  L.push("");
  L.push(`Improved: **${improved}** · unchanged: ${withBoth.length - improved - regressed} · regressed: ${regressed}`);
  L.push("");

  L.push(`## Per-pack scores`);
  L.push("");
  L.push(`| Pack | before | after | Δ | lay | typ | col | anim | trans | asset | comp | remaining (non-deliberate) |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of [...rows].sort((a, b) => b.after - a.after)) {
    const s = r.scores;
    const d = r.before == null ? "—" : (r.after - r.before > 0 ? `**+${r.after - r.before}**` : String(r.after - r.before));
    const real = r.divergences.filter((x) => !x.knownDeliberate);
    const crit = real.filter((x) => x.severity === "critical").length;
    const maj = real.filter((x) => x.severity === "major").length;
    L.push(`| ${r.slug} | ${r.before == null ? "—" : r.before} | **${r.after}** | ${d} | ${s.layout} | ${s.typography} | ${s.color} | ${s.animation} | ${s.transitions} | ${s.assets} | ${s.composition} | ${crit}C ${maj}M ${real.length - crit - maj}m |`);
  }
  L.push("");

  L.push(`## Dimension means (as % of budget)`);
  L.push("");
  L.push(`| Dimension | before | after | Δ |`);
  L.push(`|---|---|---|---|`);
  for (const [k, max] of DIMS) {
    const pv = withBoth.length ? withBoth.reduce((a, r) => a + Number(pre.get(r.slug).scores[k] || 0), 0) / withBoth.length : 0;
    const av = rows.reduce((a, r) => a + Number(r.scores[k] || 0), 0) / rows.length;
    const pct = (v) => `${((v / max) * 100).toFixed(0)}%`;
    L.push(`| ${k} /${max} | ${pv.toFixed(1)} (${pct(pv)}) | ${av.toFixed(1)} (${pct(av)}) | ${(av - pv >= 0 ? "+" : "") + (av - pv).toFixed(1)} |`);
  }
  L.push("");

  L.push(`## Divergence buckets — packs affected, before → after`);
  L.push("");
  L.push(`| Bucket | packs before | packs after | findings before | findings after |`);
  L.push(`|---|---|---|---|---|`);
  for (const [name] of BUCKETS) {
    const a = preB[name], b = postB[name];
    L.push(`| ${name} | ${a.packs} | ${b.packs} | ${a.findings} | ${b.findings} |`);
  }
  L.push("");
  L.push(`(Pre-fix population ${pre.size} packs, post-fix ${post.size}; counts are packs/findings, not percentages.)`);
  L.push("");

  const below = [...rows].filter((r) => r.after < 90).sort((a, b) => a.after - b.after);
  L.push(`## Packs still below 90 (${below.length})`);
  L.push("");
  if (!below.length) L.push(`None.`);
  else {
    L.push(`| Pack | after | dominant remaining divergence |`);
    L.push(`|---|---|---|`);
    for (const r of below.slice(0, 40)) {
      const real = r.divergences.filter((x) => !x.knownDeliberate);
      const worst = real.sort((a, b) => ({ critical: 0, major: 1, minor: 2 })[a.severity] - ({ critical: 0, major: 1, minor: 2 })[b.severity])[0];
      L.push(`| ${r.slug} | ${r.after} | ${worst ? `[${worst.category}/${worst.severity}] ${String(worst.description).replace(/\|/g, "/").slice(0, 130)}` : "—"} |`);
    }
  }
  L.push("");

  const OUT = path.join(__dirname, "..", "..", "FILMKIT-PARITY-FINAL.md");
  fs.writeFileSync(OUT, L.join("\n"), "utf8");
  fs.writeFileSync(path.join(FRAMECHECK, "phase2-scores.json"), JSON.stringify(rows, null, 1), "utf8");
  console.log(`wrote ${OUT}`);
  console.log(`mean ${meanBefore.toFixed(1)} -> ${meanAfter.toFixed(1)} | improved ${improved}, regressed ${regressed} | >=90: ${band(rows, 90, 100, "after")}/${rows.length}`);
}

if (require.main === module) main();
