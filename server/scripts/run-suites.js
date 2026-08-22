// THE TEST CHAIN RUNNER — runs every suite, then reports.
//
// `npm test` used to be 53 `npm run test:x && ...` links. One `&&` is one hidden failure: when
// `test:font-axes` died on a missing authoring drop, the 23 suites after it — golden, pack-media,
// audio, portrait, content, integration — did not run, and nothing in the output said so. The
// chain reported ONE red suite while silently declining to check half the library, which is the
// worst possible reading: it looks like a small, local problem.
//
// So the links come out. Every suite runs, every result is reported, and the exit code is 1 if
// ANY of them failed. A broken suite now costs you that suite's coverage and nothing else.
//
//   node scripts/run-suites.js              # all suites, quiet; failing output is replayed
//   node scripts/run-suites.js --verbose    # stream every suite's output as it runs
//   node scripts/run-suites.js audio golden # just these (substring match on the suite name)
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const pkg = require("../package.json");

// THE ORDER IS THE OLD CHAIN'S ORDER, deliberately. Some suites are cheap guards that fail fast
// and some take minutes; running the cheap ones first is why the original order looked the way
// it did, and nothing here is a reason to reshuffle it.
const SUITES = [
  "test:brand-kit", "test:asset-priority", "test:pixabay", "test:asset-sources",
  "test:asset-scoring", "test:reuse", "test:asset-prep", "test:video-quality",
  "test:media-profiles", "test:website-assets", "test:taxonomy", "test:screenshot-intake",
  "test:handoffs", "test:quality", "test:peekshot", "test:variety", "test:transitions",
  "test:ghosts", "test:no-playback-chrome", "test:motion-safety", "test:dead-tweens",
  "test:tween-units", "test:dead-exports", "test:admin-templates", "test:template-batch",
  "test:dropped-css", "test:shot-containment", "test:beat-ground", "test:treatments",
  "test:font-axes", "test:font-metrics", "test:film-skins", "test:film-packs",
  "test:lf-skins", "test:lf-packs", "test:pack-composers", "test:pack-media",
  "test:framecheck", "test:audio", "test:audio-profiles", "test:music-diversity",
  "test:music-history", "test:pacing", "test:beat-sync", "test:music-vocab", "test:spread",
  "test:portrait", "test:orientation", "test:frame-fill", "test:golden", "test:content",
  "test:longform-templates", "test:integration",
];

// Suites that are deliberately NOT part of `npm test`: they hit the network, or they are the
// long/report variant of a suite already in the list above. `test:verbose` is this runner's own
// alias — it is not a suite at all, and listing it here is what keeps the guard below honest
// rather than teaching the guard to ignore names that merely look like aliases.
const EXCLUDED = new Set([
  "test:providers-live", "test:providers-matrix", "test:asset-sources-live",
  "test:film-safe-area", "test:frame-fill-all", "test:plan-diff", "test:longform-online",
  "test:verbose",
]);

// DRIFT GUARD. A suite added to package.json and wired into neither list is a suite nobody runs
// — the failure mode this whole file exists to prevent, arriving through the front door. Ditto a
// name in SUITES that no longer resolves to a script.
function auditLists() {
  const defined = Object.keys(pkg.scripts).filter((k) => k.startsWith("test:"));
  const problems = [];
  for (const s of SUITES) if (!pkg.scripts[s]) problems.push(`SUITES lists "${s}", which package.json does not define`);
  for (const d of defined) {
    if (!SUITES.includes(d) && !EXCLUDED.has(d)) problems.push(`package.json defines "${d}", which is in neither SUITES nor EXCLUDED`);
  }
  for (const e of EXCLUDED) if (!pkg.scripts[e]) problems.push(`EXCLUDED lists "${e}", which package.json does not define`);
  const dupes = SUITES.filter((s, i) => SUITES.indexOf(s) !== i);
  for (const d of new Set(dupes)) problems.push(`SUITES lists "${d}" more than once`);
  return problems;
}

// Every test:* script is `node scripts/<file>.js [args]`. Spawn node directly rather than going
// back through npm: 53 npm launches cost more wall-clock on Windows than several of the suites
// they wrap. Anything that is not a plain node invocation falls back to the shell.
function runSuite(name, { verbose }) {
  const cmd = pkg.scripts[name];
  const started = Date.now();
  const opts = {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    stdio: verbose ? "inherit" : "pipe",
    maxBuffer: 64 * 1024 * 1024,
  };
  const r = cmd.startsWith("node ")
    ? spawnSync(process.execPath, cmd.slice(5).trim().split(/\s+/), opts)
    : spawnSync(cmd, { ...opts, shell: true });
  const output = verbose ? "" : `${r.stdout || ""}${r.stderr || ""}`;
  return {
    name,
    // A suite killed by a signal (or one node could not launch) has a null status. That is a
    // failure, not a pass — `status === 0` would read `null === 0` as false anyway, but being
    // explicit keeps a crashed suite from ever being mistaken for a quiet one.
    ok: r.status === 0,
    status: r.status,
    ms: Date.now() - started,
    output,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const verbose = argv.includes("--verbose");
  const filters = argv.filter((a) => !a.startsWith("--"));

  const problems = auditLists();
  if (problems.length) {
    console.error("run-suites: the suite lists are out of step with package.json");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const chosen = filters.length
    ? SUITES.filter((s) => filters.some((f) => s.includes(f)))
    : SUITES;
  if (!chosen.length) {
    console.error(`run-suites: no suite matched ${JSON.stringify(filters)}`);
    process.exit(1);
  }

  console.log(`run-suites: ${chosen.length} suite(s)\n`);
  const results = [];
  for (const name of chosen) {
    process.stdout.write(`  ${name.padEnd(28)} `);
    const r = runSuite(name, { verbose });
    results.push(r);
    const secs = (r.ms / 1000).toFixed(1).padStart(6);
    console.log(`${r.ok ? "ok  " : "FAIL"} ${secs}s`);
  }

  const failed = results.filter((r) => !r.ok);
  if (!verbose) {
    for (const f of failed) {
      console.log(`\n${"=".repeat(72)}\n${f.name} — exit ${f.status}\n${"=".repeat(72)}`);
      console.log(f.output.trimEnd());
    }
  }

  const passed = results.length - failed.length;
  console.log(`\n${passed} suite(s) passed, ${failed.length} failed`);
  if (failed.length) {
    console.log(`failed: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
