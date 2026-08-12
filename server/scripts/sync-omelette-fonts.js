// A bundled template ships its OWN typography — the pack manifest does not skin
// it. Where the two disagree, QA is handed the manifest's font as a "concrete,
// checkable expectation", looks at the film, and correctly reports a TYPOGRAPHY
// blocker that no repair pass can ever fix: the film is right and the metadata is
// wrong. (Measured: 16 of 19 omelette packs disagreed; fetch-vertical claimed
// "Archivo Black" while FetchVertical.html renders Fredoka.)
//
// This reads the truth out of each template and writes it back to pack.json.
// `--check` reports without writing, so it can gate CI.
const fs = require("fs");
const path = require("path");

const FRAMES = path.join(__dirname, "..", "..", "frames");
const TPL = path.join(__dirname, "..", "public", "omelette-templates");
const CHECK = process.argv.includes("--check");

// Families a template merely falls back to — never its identity.
const GENERIC = /^(-apple-system|BlinkMacSystemFont|system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-monospace|Segoe UI|Roboto|Helvetica|Arial|Inter)$/i;

function sizeToPx(raw) {
  const m = /([\d.]+)\s*(px|rem|em|cqw|cqh|vw|vh|%)?/.exec(String(raw));
  if (!m) return 0;
  const n = parseFloat(m[1]) || 0;
  switch ((m[2] || "px").toLowerCase()) {
    case "rem": case "em": return n * 16;
    case "cqw": case "vw": return n * 10.8;   // 1080-wide portrait frame
    case "cqh": case "vh": return n * 19.2;
    case "%": return n * 0.16;
    default: return n;
  }
}

// Display = the family the LARGEST TEXT ACTUALLY RENDERS IN. Static analysis of
// compiled CSS could not decide this: @font-face blocks declare a family with no
// size, the root rule is a generic reset, and only some templates expose a
// --font-heading variable. Reading it back off the rendered DOM is the only
// answer that cannot be argued with.
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function measure(browser, tplFile) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto("file:///" + path.resolve(tplFile).split("\\").join("/"), { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));
    const seen = new Map();   // family -> largest rendered px
    // Sample across the template so every authored scene contributes.
    for (const frac of [0.08, 0.25, 0.45, 0.65, 0.85]) {
      await page.evaluate((f) => {
        const tl = (window.__timelines || {}).vid;
        if (tl && tl.duration) tl.time(tl.duration() * f);
      }, frac);
      await new Promise((r) => setTimeout(r, 250));
      const found = await page.evaluate(() => {
        const out = [];
        const walk = (root) => {
          for (const el of root.querySelectorAll("*")) {
            if (el.shadowRoot) walk(el.shadowRoot);
            if (!el.childNodes.length) continue;
            let text = "";
            for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
            if (!text.trim()) continue;
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4 || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
            out.push({ fam: cs.fontFamily, px: parseFloat(cs.fontSize) || 0 });
          }
        };
        walk(document);
        return out;
      });
      for (const f of found) {
        const first = String(f.fam).split(",")[0].trim().replace(/^['"]|['"]$/g, "");
        if (!first || GENERIC.test(first)) continue;
        if (!seen.has(first) || f.px > seen.get(first)) seen.set(first, f.px);
      }
    }
    if (!seen.size) return null;
    const ranked = [...seen.entries()].sort((a, b) => b[1] - a[1]);
    // A pack's typography is its HEADLINE and BODY faces. Small chrome — a mono
    // badge, a URL strip — is not identity, and letting it through added a
    // spurious "JetBrains Mono" to almost every pack.
    const identity = ranked.filter(([, px]) => px >= 24);
    const keep = (identity.length ? identity : ranked).slice(0, 2);
    return { display: keep[0][0], fonts: keep.map((r) => r[0]), sizes: keep };
  } finally { await page.close().catch(() => {}); }
}

(async () => {
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"] });
const rows = [];
for (const dir of fs.readdirSync(FRAMES)) {
  const pj = path.join(FRAMES, dir, "pack.json");
  if (!fs.existsSync(pj)) continue;
  let pack; try { pack = JSON.parse(fs.readFileSync(pj, "utf8")); } catch { continue; }
  if (pack.renderer !== "omelette") continue;
  const tplName = pack.template || pack.omeletteTemplate;
  const tplFile = path.join(TPL, `${tplName}.html`);
  if (!fs.existsSync(tplFile)) { rows.push({ dir, skip: `template ${tplName}.html missing` }); continue; }

  const real = await measure(browser, tplFile);
  if (!real) { rows.push({ dir, skip: "no rendered text measured" }); continue; }

  const wasDisplay = (pack.typography && pack.typography.display) || null;
  const wasFonts = Array.isArray(pack.fonts) ? pack.fonts : [];
  const changed = wasDisplay !== real.display || wasFonts.join(",") !== real.fonts.join(",");
  rows.push({ dir, tplName, wasDisplay, wasFonts, real, changed });

  if (changed && !CHECK) {
    pack.typography = { ...(pack.typography || {}), display: real.display };
    pack.fonts = real.fonts;
    fs.writeFileSync(pj, JSON.stringify(pack, null, 2) + "\n");
  }
}

let changed = 0;
console.log("pack                 display (was -> is)                       fonts");
for (const r of rows) {
  if (r.skip) { console.log(`${r.dir.padEnd(20)} SKIP: ${r.skip}`); continue; }
  if (r.changed) changed++;
  const arrow = r.changed ? `${String(r.wasDisplay).padEnd(18)} -> ${r.real.display}` : `${String(r.real.display).padEnd(18)}    (already right)`;
  console.log(`${r.dir.padEnd(20)} ${arrow.padEnd(42)} ${r.real.fonts.join(", ")}`);
}
console.log(`\n${rows.filter((r) => !r.skip).length} omelette pack(s); ${changed} ${CHECK ? "still disagree with their template" : "updated"}.`);
await browser.close();
if (CHECK && changed) process.exit(1);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
