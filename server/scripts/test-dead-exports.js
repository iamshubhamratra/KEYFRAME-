// DEAD-EXPORT GUARD — a furniture helper that nothing calls.
//
// THE FAILURE CLASS. The template-fidelity audit named this as a root cause in its own right:
// signature cast "dropped, OR WRITTEN AND LEFT UNWIRED". Measured instances at the time of writing:
//   • hacker_furniture.js exports glitch(), term() and meter(). Nothing imports them — and
//     self-typing code is the FIRST feature the Hacker README advertises. The pack shipped with
//     nothing typing, while the code to make it type sat finished in the repository.
//   • jungle_composer.js declared a correct butterfly() that was never called, while a buggy
//     inline copy rendered instead — so the good implementation and the visible bug coexisted.
//
// WHY NO EXISTING GUARD SEES IT. `test:dead-tweens` catches the MIRROR image — a tween whose target
// element does not exist. This is a drawing that nothing ever asks for. Both are "authored and not
// rendered", and the whole suite could only see one of them:
//
//     tween without element  ->  test:dead-tweens        ✓ caught
//     element without tween  ->  (momentum/drive progress rails — found by hand)
//     helper without caller  ->  THIS GUARD
//
// A dead export is not merely unused code. In this codebase it is evidence that a beat's signature
// furniture was built and then not connected — which renders as a template missing the thing it is
// named for, with no error anywhere and every test green.
//
// SCOPE. Only the furniture/cast modules, because they exist solely to be drawn by a composer. It
// deliberately does NOT police the shared kits (om_port_kit, composer_kit, transition_kit): those
// are general-purpose libraries whose exports may legitimately await a caller.

const fs = require("node:fs");
const path = require("node:path");

const SVC = path.join(__dirname, "..", "src", "services");

// Modules whose entire purpose is to be drawn. `om_furniture.js` is included: it is the shared
// print-furniture library for the ported packs, and an unused helper there means a pack rolled its
// own instead of using it — the duplication this module exists to prevent.
function furnitureModules() {
  return fs.readdirSync(SVC)
    .filter((f) => f.endsWith("_furniture.js") || f === "om_furniture.js" || f === "om_svg_cast.js")
    .sort();
}

// The `module.exports = { ... }` object literal, brace-matched.
//
// The first version anchored the closing brace to a newline (`[\s\S]*?\n\}`), which silently
// skipped four of the six furniture modules — including hacker_furniture.js, the module this guard
// was written for — because they close on ONE line: `module.exports = { matrix, crt, term, ... };`
// A guard that reports "skipped" for its own motivating case passes vacuously, which is the exact
// trap this codebase already documented: calibrate against the bug before believing a green run.
function exportsBlock(src) {
  const at = src.search(/module\.exports\s*=\s*\{/);
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return null;
}

// Exported symbol names from a `module.exports = { a, b, c: d, ...spread }` block or `exports.x =`.
function exportsOf(src) {
  const names = new Set();
  const block = exportsBlock(src);
  if (block) {
    // Strip nested object values so `a: { b: 1 }` does not contribute `b`.
    const flat = block.replace(/\{[^{}]*\}/g, "");
    for (const m of flat.matchAll(/(?:^|[,\s])([A-Za-z_$][\w$]*)\s*(?=[,}\n]|$)/g)) names.add(m[1]);
    for (const m of flat.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) names.add(m[1]);
    // For `key: value`, `value` is a local binding, not an export.
    for (const m of flat.matchAll(/[A-Za-z_$][\w$]*\s*:\s*([A-Za-z_$][\w$]*)/g)) names.delete(m[1]);
  }
  for (const m of src.matchAll(/^\s*exports\.([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
  names.delete("module");
  return [...names];
}

// Modules that RE-EXPORT another module wholesale: `module.exports = { ..., ...require("./x") }`.
//
// om_port_kit.js:773 spreads om_furniture, which is the documented way a pack reaches `K.figPlate`
// / `K.marquee` / `K.dotField`. Because a spread copies values rather than naming them, none of
// om_furniture's symbols appear literally anywhere in om_port_kit — so a reachability check that
// only follows direct requires declared all 13 of them dead while packs were calling them daily.
// Spread edges have to be followed or the guard is measuring the wrong graph.
function spreadReexports(src) {
  const block = exportsBlock(src);
  if (!block) return [];
  return [...block.matchAll(/\.\.\.require\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => path.basename(m[1], ".js"));
}

// Every .js under src/services, so a helper called from anywhere in the service layer counts.
function allServiceFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) out.push(p);
    }
  };
  walk(SVC);
  return out;
}

function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const modules = furnitureModules().filter((m) => !only.length || only.some((o) => m.includes(o)));
  const files = allServiceFiles();
  const sources = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

  console.log(`\nDEAD-EXPORT GUARD — ${modules.length} furniture module(s)\n`);

  let failed = 0, checkedSymbols = 0;
  for (const mod of modules) {
    const modPath = path.join(SVC, mod);
    const src = sources.get(modPath) || "";
    const names = exportsOf(src);
    if (!names.length) { console.log(`  · ${mod}: no module.exports block found — skipped`); continue; }

    // Every module through which this one's symbols are reachable: itself, plus anything that
    // spread-re-exports it (transitively — a pack reaches om_furniture via om_port_kit).
    const base = mod.replace(/\.js$/, "");
    const roots = new Set([base]);
    for (let grew = true; grew;) {
      grew = false;
      for (const f of files) {
        const b = path.basename(f, ".js");
        if (roots.has(b)) continue;
        if (spreadReexports(sources.get(f) || "").some((t) => roots.has(t))) { roots.add(b); grew = true; }
      }
    }
    const reReq = new RegExp(`require\\(["'\`][^"'\`]*\\b(${[...roots].join("|")})["'\`]\\)`);
    const consumers = files.filter((f) => f !== modPath && reReq.test(sources.get(f) || ""));

    const dead = [], internalOnly = [];
    const own = src;
    for (const nm of names) {
      checkedSymbols++;
      const re = new RegExp(`\\.${nm}\\b|\\b${nm}\\b`);
      const usedOutside = consumers.some((f) => re.test(sources.get(f) || ""));
      if (usedOutside) continue;
      // Used by a sibling inside its own module (fetch_furniture's `tree`/`bush` are drawn by
      // `park()`): reachable and rendered, merely over-exported. Reported, never failed.
      const bodyWithoutExports = own.replace(/module\.exports[\s\S]*$/, "");
      const usesInternally = new RegExp(`\\b${nm}\\s*\\(|\\b${nm}\\b`).test(
        bodyWithoutExports.replace(new RegExp(`(?:const|let|function)\\s+${nm}\\b`, "g"), "")
      );
      if (usesInternally) internalOnly.push(nm); else dead.push(nm);
    }

    if (dead.length) {
      failed++;
      console.log(`  ✗ ${mod}: ${dead.length} export(s) NOTHING calls — ${dead.join(", ")}`);
      console.log(`      ${consumers.length ? `${consumers.length} module(s) can reach this file` : "NOTHING requires this file at all"}.`);
      console.log(`      Furniture exists to be drawn. Wire it, or delete it — an unwired helper is`);
      console.log(`      indistinguishable from a beat whose signature cast was never connected.`);
    } else {
      console.log(`  ✓ ${mod}: all ${names.length} export(s) reach a caller`
        + (internalOnly.length ? `  (${internalOnly.length} used only within the module: ${internalOnly.join(", ")})` : ""));
    }
  }

  console.log(`\n${modules.length - failed} passed, ${failed} failed  (${checkedSymbols} exported symbol(s) checked)`);
  if (failed) process.exit(1);
}

if (require.main === module) main();
module.exports = { exportsOf, furnitureModules };
