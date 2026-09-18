// CONTACT SHEET — tile every scene PNG of one audit run into a single image, so a
// whole film can be judged in one look instead of sixteen.
//
//   node scripts/contact-sheet.js --dir scripts/vfilm --tag before --cols 8 --cell 260
//
// Pure Chromium (no ffmpeg/sharp dependency): lays the PNGs out in a grid in a page
// and screenshots it.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const DIR = path.resolve(opt("--dir", path.join(__dirname, "vfilm")));
const TAG = opt("--tag", "before");
const COLS = Number(opt("--cols", 8));
const CELL = Number(opt("--cell", 260));
const OUTF = opt("--out", path.join(DIR, `_sheet_${TAG}.png`));

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

const nat = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const files = fs.readdirSync(DIR)
  .filter((f) => f.startsWith(`${TAG}__`) && f.endsWith(".png"))
  .sort(nat);
if (!files.length) { console.error(`no ${TAG}__*.png in ${DIR}`); process.exit(1); }

const cellH = Math.round(CELL * 16 / 9);
const rows = Math.ceil(files.length / COLS);
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#15161a;font:11px ui-monospace,Menlo,monospace;color:#cfd2da}
  .g{display:grid;grid-template-columns:repeat(${COLS},${CELL}px);gap:10px;padding:12px}
  .c{width:${CELL}px}
  .c img{width:${CELL}px;height:${cellH}px;object-fit:contain;background:#000;display:block;border-radius:3px}
  .c div{padding:4px 2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style><div class="g">${files.map((f) => {
  const label = f.replace(`${TAG}__`, "").replace(/\.png$/, "").replace(/^[a-z_]+__/, "");
  return `<div class="c"><img src="${encodeURIComponent(f)}"><div>${label}</div></div>`;
}).join("")}</div>`;

const tmp = path.join(DIR, `_sheet_${TAG}.html`);
fs.writeFileSync(tmp, html, "utf8");

(async () => {
  const puppeteer = require("puppeteer-core");
  const exe = headlessShell();
  if (!exe) { console.error("no chrome-headless-shell"); process.exit(2); }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: true,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "cs-")),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: COLS * (CELL + 10) + 24, height: rows * (cellH + 28) + 24 });
  await page.goto("file://" + tmp.replace(/\\/g, "/"), { waitUntil: "networkidle0" });
  await page.screenshot({ path: OUTF, fullPage: true });
  await browser.close();
  console.log(OUTF);
})().catch((e) => { console.error(e); process.exit(1); });
