// Dev/CI legibility audit — sweep one or more composed job dirs and report any
// text that fails WCAG AA contrast against what's rendered behind it.
//
// Usage:
//   node server/scripts/audit-contrast.js <jobDir> [<jobDir> ...] [--samples N]
//   node server/scripts/audit-contrast.js server/jobs/ofz9448zxi
//
// Exit code is 1 if any composition has an AA failure (so it can gate CI),
// 0 otherwise. Uses the same Chromium the renderer downloaded; needs no extra
// install (puppeteer-core is already a server dependency).

const path = require("node:path");
const fs = require("node:fs");
const { contrastCheck } = require("../src/services/contrast_check");

function parseArgs(argv) {
  const dirs = [];
  let samples = 5, verbose = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--samples") samples = Number(argv[++i]) || 5;
    else if (a === "--verbose" || a === "-v") verbose = true;
    else dirs.push(a);
  }
  return { dirs, samples, verbose };
}

async function main() {
  const { dirs, samples, verbose } = parseArgs(process.argv.slice(2));
  if (!dirs.length) {
    console.error("usage: node server/scripts/audit-contrast.js <jobDir> [<jobDir> ...] [--samples N]");
    process.exit(2);
  }

  let anyFail = false;
  for (const dir of dirs) {
    const abs = path.resolve(dir);
    const label = path.basename(abs);
    if (!fs.existsSync(path.join(abs, "index.html"))) {
      console.log(`\n▐ ${label}: no index.html — skipped`);
      continue;
    }
    process.stdout.write(`\n▐ ${label}: auditing (${samples} samples)… `);
    const res = await contrastCheck(abs, { samples });
    if (res.skipped) { console.log(`skipped (${res.skipped})`); continue; }

    if (verbose && res.all) {
      console.log(`measured ${res.all.length} text sample(s):`);
      for (const e of [...res.all].sort((a, b) => a.ratio - b.ratio)) {
        const mark = e.pass ? "✓" : "✗";
        console.log(`    ${mark} ${String(e.ratio).padStart(6)}:1  (need ${e.needed}:1)  ${e.selector.padEnd(22)} t=${e.time}s  "${e.text}"`);
      }
    }
    const persistent = res.persistentFailures || [];
    if (res.ok) {
      console.log(`✓ legible — every text element clears WCAG AA at its best sampled moment (${res.samples.length} samples)`);
    } else {
      anyFail = true;
      console.log(`✗ ${persistent.length} text element(s) never reach WCAG AA:`);
      for (const f of persistent) {
        console.log(`    ${String(f.bestRatio).padStart(5)}:1  (need ${f.needed}:1)  ${f.selector.padEnd(22)} best@${f.bestTime}s  "${f.text}"`);
      }
    }
  }

  console.log("");
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
