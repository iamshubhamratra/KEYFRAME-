// GOLDEN BASELINE MAINTENANCE — keep scripts/golden-composers.txt correct across a publish.
//
// WHY THIS EXISTS. `npm test` includes `test:golden`, which builds every pack listed by
// frame_registry.listPacks() against a fixed storyboard and compares the resulting hashes to a
// committed 270-line baseline BYTE FOR BYTE. Publishing a template adds it to listPacks(), so
// the harness immediately produces two lines the baseline does not have and the whole test
// chain goes red — on a green tree, for a correct action.
//
// The obvious fix is to re-run the harness with --update, and it is the wrong one: --update
// rewrites all 270 lines from the current working tree, so any UNRELATED composer drift sitting
// uncommitted gets silently absorbed into a commit that claims to be about publishing a
// template. That is exactly how a real regression ships unnoticed.
//
// So this splices. It computes the two lines the new pack is responsible for, inserts them in
// the harness's own ordering, and leaves every other line untouched. Unpublishing removes them
// again. If the file is missing (a checkout that never ran the harness) it is left alone rather
// than invented — a baseline built from one pack would be worse than none.

const fs = require("node:fs");
const paths = require("./paths");

// Required lazily: golden-composers.js pulls in the whole composer dispatch table, and this
// module is loaded by the admin router at boot.
function harness() { return require("../../scripts/golden-composers.js"); }

function readBaseline() {
  const { BASELINE } = harness();
  try { return { file: BASELINE, text: fs.readFileSync(BASELINE, "utf8") }; }
  catch { return { file: BASELINE, text: null }; }
}

// The pack name a baseline line belongs to. The format is `${pack.padEnd(20)} ${label} ${hash}`,
// so the name is simply the first whitespace-delimited token.
const packOf = (line) => String(line || "").trim().split(/\s+/)[0] || "";

// Insert a pack's two lines in the position the harness would have written them. The harness
// iterates listPacks(), which returns a `.sort()`ed directory listing — so the file is ordered
// by pack name, and "where would this pack have appeared" is answerable without re-running it.
function addPack(slug) {
  paths.assertSlug(slug);
  const { file, text } = readBaseline();
  if (text == null) return { changed: false, reason: "no baseline file on disk" };

  const lines = text.split("\n").filter((l) => l.length);
  if (lines.some((l) => packOf(l) === slug)) return { changed: false, reason: "already present" };

  const fresh = harness().linesForPack(slug);
  if (!fresh) return { changed: false, reason: "pack has no dedicated composer — the harness would skip it" };
  // An ERROR: hash means the composition threw. Recording that as a baseline would enshrine the
  // failure as the expected output, and every later run would agree with it.
  if (fresh.some((l) => l.includes("ERROR:"))) {
    return { changed: false, reason: `the composition failed to build: ${fresh.find((l) => l.includes("ERROR:")).split("ERROR:")[1].trim()}` };
  }

  let at = lines.findIndex((l) => packOf(l) > slug);
  if (at < 0) at = lines.length;
  lines.splice(at, 0, ...fresh);
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
  return { changed: true, added: fresh.length };
}

function removePack(slug) {
  paths.assertSlug(slug);
  const { file, text } = readBaseline();
  if (text == null) return { changed: false, reason: "no baseline file on disk" };
  const lines = text.split("\n").filter((l) => l.length);
  const kept = lines.filter((l) => packOf(l) !== slug);
  if (kept.length === lines.length) return { changed: false, reason: "not present" };
  fs.writeFileSync(file, kept.join("\n") + "\n", "utf8");
  return { changed: true, removed: lines.length - kept.length };
}

module.exports = { addPack, removePack };
