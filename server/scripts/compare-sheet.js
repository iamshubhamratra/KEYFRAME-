// COMPARE SHEET — the same scenes, before and after, in one image.
//
//   node scripts/compare-sheet.js --dir scripts/vfilm --a before --b after --scenes s4,s7,s9,s13
//
// Pairs `<a>__*__<scene>_*.png` with `<b>__*__<scene>_*.png` and stacks each pair in a
// column, so a layout change is a diff rather than an argument.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const DIR = path.resolve(opt("--dir", path.join(__dirname, "vfilm")));
const A = opt("--a", "before"), B = opt("--b", "after");
const CELL = Number(opt("--cell", 300));
const SCENES = opt("--scenes", "").split(",").filter(Boolean);
const OUTF = opt("--out", path.join(DIR, `_compare_${A}_${B}.png`));

function headlessShell() {
  const base = path.join(os.homedir(), ".cache", "puppeteer", "chrome-headless-shell");
  try {
    for (const d of fs.readdirSync(base).sort().reverse()) {
      for (const leaf of ["chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-headless-shell-linux64/chrome-headless-shell", "chrome-headless-shell"]) {
        const p = path.join(base, d, leaf);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* none */ }
  return null;
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
const sceneOf = (f) => { const m = f.match(/__((?:s\d+))_/); return m ? m[1] : null; };
const pick = (tag, scene) => files.find((f) => f.startsWith(`${tag}__`) && sceneOf(f) === scene);

const scenes = SCENES.length
  ? SCENES
  : [...new Set(files.filter((f) => f.startsWith(`${A}__`)).map(sceneOf).filter(Boolean))]
    .sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));

const pairs = scenes.map((s) => ({ s, a: pick(A, s), b: pick(B, s) })).filter((p) => p.a && p.b);
if (!pairs.length) { console.error("no matching pairs"); process.exit(1); }

const cellH = Math.round(CELL * 16 / 9);
const html = `<!doctype html><meta charset="utf-8"><style>
 body{margin:0;background:#15161a;font:13px ui-monospace,Menlo,monospace;color:#cfd2da}
 .g{display:grid;grid-template-columns:repeat(${pairs.length},${CELL}px);gap:14px;padding:16px}
 .c img{width:${CELL}px;height:${cellH}px;object-fit:contain;background:#000;display:block;border-radius:4px}
 .lab{padding:6px 2px 2px;color:#8d93a1}
 .hdr{font-weight:700;padding:2px 2px 8px}
</style><div class="g">${pairs.map((p) => `<div class="c">
  <div class="hdr">${p.s}</div>
  <div class="lab">${A.toUpperCase()}</div><img src="${encodeURIComponent(p.a)}">
  <div class="lab">${B.toUpperCase()}</div><img src="${encodeURIComponent(p.b)}">
</div>`).join("")}</div>`;

const tmp = path.join(DIR, `_compare_${A}_${B}.html`);
fs.writeFileSync(tmp, html, "utf8");

(async () => {
  const puppeteer = require("puppeteer-core");
  const exe = headlessShell();
  if (!exe) { console.error("no chrome-headless-shell"); process.exit(2); }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: true,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "cmp-")),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: pairs.length * (CELL + 14) + 32, height: cellH * 2 + 120 });
  await page.goto("file://" + tmp.replace(/\\/g, "/"), { waitUntil: "networkidle0" });
  await page.screenshot({ path: OUTF, fullPage: true });
  await browser.close();
  console.log(OUTF);
})().catch((e) => { console.error(e); process.exit(1); });
