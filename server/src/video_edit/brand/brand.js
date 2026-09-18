// VIDEO EDIT BRAND — logo palette extraction and the edit's resolved brand palette (EDIT_PLAN.md Branding).
//
// WHY THIS EXISTS. Captions, cards and the logo corner all take their accent from one palette, and the
// palette has exactly three honest sources: colours the user typed, colours read off their logo, or the
// product default. Logos are mostly transparent PNG/SVG — an alpha-blind sampler (like the website
// ingest's dominantColors, which decodes rgb24) reads whatever RGB hides under alpha 0, often pure black,
// white or an export artefact, and ships a brand colour nobody chose. So pixels with alpha < 128 are
// skipped before quantizing. SVGs are rasterized headlessly, sandboxed (img element, network requests
// aborted) and fail-open: no Chromium means no logo colours, never a failed edit. The chosen accent goes
// through art_director.defaultBrandSkin (the same accent-worthiness rules as the template path) and
// brand_kit.resolveBrand (lifted to ≥ 3:1 on the dark caption outline, hue held).
//
// CONTRACT:
//   extractLogoPalette(file, { signal, maxColors=4, timeoutMs=60000 })
//     -> Promise<{ colors:string[] (#rrggbb, ranked), neutrals:string[], opaqueRatio, width, height, rasterized, skipped:string|null }>
//     PNG/JPEG/WebP via ffmpeg rgba decode (nearest-neighbour, long edge ≤ 512) → 48×48 alpha-aware cells
//     (a cell counts when ≥ 50 % of its pixels have alpha ≥ 128; its colour is the mean of those pixels) →
//     dominantColors-style buckets (>>5 per channel, skip lum > .92 / < .08 / sat < .15, score = count·(meanSat+.3)).
//     SVG: rasterizeSvg first; any failure → { colors:[], skipped:<reason> }.
//   rasterizeSvg(svgPath, outPng, { size=512, timeoutMs=60000, signal }) -> Promise<{ ok, path?, skipped? }>
//   resolveEditBrand({ userPalette, logoPalette }, deps?) -> { primary, accent, text, onAccent, source:'user'|'logo'|'default' }
//     userPalette: string[] | { primary, accent?, secondary?, colors? } ; logoPalette: string[] | extractLogoPalette result.
//     deps: { artDirector:{ defaultBrandSkin }, brandKit:{ resolveBrand } } for tests / callers that already hold them.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const proc = require("../engine/proc");
const { EditError } = require("../errors");
const { DEFAULT_PALETTE } = require("../plan/schema");

const GRID = 48;
const MAX_DECODE_EDGE = 512;
const ALPHA_MIN = 128;
const SVG_MAX_BYTES = 2 * 1024 * 1024;
const CAPTION_GROUND = "#000000"; // captions/cards draw brand colour against a black outline / dark scrim
const TEXT_ON_VIDEO = "#ffffff";

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;
const normHex = (v) => { const m = HEX_RE.exec(String(v == null ? "" : v).trim()); return m ? `#${m[1].toLowerCase()}` : null; };
const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

const IMAGE_DEMUXERS = { ".png": "png_pipe", ".jpg": "jpeg_pipe", ".jpeg": "jpeg_pipe", ".webp": "webp_pipe", ".bmp": "bmp_pipe", ".gif": "gif" };

// ---- SVG rasterization --------------------------------------------------------------------------
async function rasterizeSvg(svgPath, outPng, { size = 512, timeoutMs = 60000, signal } = {}) {
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); } catch { return { ok: false, skipped: "puppeteer-core not installed" }; }
  let exe = null;
  try { exe = require("../../services/runtime_check").findChromium(); } catch { exe = null; }
  if (!exe) return { ok: false, skipped: "no chromium" };
  let svg;
  try {
    const st = fs.statSync(svgPath);
    if (st.size > SVG_MAX_BYTES) return { ok: false, skipped: "svg too large" };
    svg = fs.readFileSync(svgPath);
  } catch { return { ok: false, skipped: "svg unreadable" }; }
  if (!/<svg[\s>]/i.test(svg.toString("utf8", 0, Math.min(svg.length, 4096)))) return { ok: false, skipped: "not an svg" };
  if (signal && signal.aborted) return { ok: false, skipped: "aborted" };

  const px = Math.max(48, Math.min(1024, Math.round(size)));
  const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:${px}px;height:${px}px;object-fit:contain}</style></head>`
    + `<body><img id="logo" src="data:image/svg+xml;base64,${svg.toString("base64")}"></body></html>`;
  let browser = null;
  let timer = null;
  const onAbort = () => { if (browser) browser.close().catch(() => {}); };
  try {
    const work = (async () => {
      browser = await puppeteer.launch({
        executablePath: exe, headless: "shell",
        args: ["--no-sandbox", "--disable-gpu", "--no-first-run", "--disable-extensions", "--disable-background-networking", "--disable-sync"],
      });
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (req) => { const u = req.url(); if (u.startsWith("data:") || u === "about:blank") req.continue(); else req.abort(); });
      await page.setViewport({ width: px, height: px, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
      const decoded = await page.evaluate(async () => {
        const img = document.getElementById("logo");
        try { await img.decode(); } catch { return false; }
        return img.naturalWidth > 0 || img.complete;
      });
      if (!decoded) throw new Error("svg did not decode");
      const tmp = `${outPng}.${process.pid}.tmp.png`;
      await page.screenshot({ path: tmp, omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
      fs.renameSync(tmp, outPng);
      return { ok: true, path: outPng };
    })();
    const watchdog = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, skipped: "timeout" }), timeoutMs + 5000); });
    return await Promise.race([work, watchdog]);
  } catch (e) {
    return { ok: false, skipped: String((e && e.message) || e).slice(0, 160) };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
    if (browser) { try { await browser.close(); } catch { /* noop */ } }
  }
}

// ---- raster palette -------------------------------------------------------------------------------
function paletteFromRgba(buf, W, H, maxColors) {
  const cells = new Map(); // idx -> { n, op, r, g, b }
  for (let y = 0; y < H; y++) {
    const cy = Math.min(GRID - 1, Math.floor((y * GRID) / H));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const cx = Math.min(GRID - 1, Math.floor((x * GRID) / W));
      const k = cy * GRID + cx;
      let c = cells.get(k);
      if (!c) { c = { n: 0, op: 0, r: 0, g: 0, b: 0 }; cells.set(k, c); }
      c.n++;
      if (buf[i + 3] >= ALPHA_MIN) { c.op++; c.r += buf[i]; c.g += buf[i + 1]; c.b += buf[i + 2]; }
    }
  }
  const buckets = new Map(), neutral = new Map();
  let opaqueCells = 0;
  for (const c of cells.values()) {
    if (c.op * 2 < c.n) continue;
    opaqueCells++;
    const r = c.r / c.op, g = c.g / c.op, b = c.b / c.op;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = (r + g + b) / 765;
    const key = `${Math.round(r) >> 5}_${Math.round(g) >> 5}_${Math.round(b) >> 5}`;
    const target = lum > 0.92 || lum < 0.08 || sat < 0.15 ? neutral : buckets;
    const e = target.get(key) || { count: 0, sat: 0, r: 0, g: 0, b: 0 };
    e.count++; e.sat += sat; e.r += r; e.g += g; e.b += b;
    target.set(key, e);
  }
  const rank = (m, n) => [...m.values()]
    .map((e) => ({ score: e.count * (e.sat / e.count + 0.3), hex: toHex(e.r / e.count, e.g / e.count, e.b / e.count) }))
    .sort((a, b) => b.score - a.score)
    .map((e) => e.hex)
    .filter((h, i, a) => a.indexOf(h) === i)
    .slice(0, n);
  return { colors: rank(buckets, maxColors), neutrals: rank(neutral, 2), opaqueRatio: cells.size ? Math.round((opaqueCells / cells.size) * 1000) / 1000 : 0 };
}

async function extractLogoPalette(file, { signal, maxColors = 4, timeoutMs = 60000 } = {}) {
  const empty = (skipped, extra = {}) => ({ colors: [], neutrals: [], opaqueRatio: 0, width: 0, height: 0, rasterized: false, skipped, ...extra });
  if (typeof file !== "string" || !fs.existsSync(file)) return empty("file missing");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ve-logo-"));
  try {
    let input = path.resolve(file);
    let rasterized = false;
    if (path.extname(input).toLowerCase() === ".svg") {
      const png = path.join(tmpDir, "logo.png");
      const r = await rasterizeSvg(input, png, { size: MAX_DECODE_EDGE, timeoutMs, signal });
      if (!r.ok) return empty(`svg not rasterized: ${r.skipped}`);
      input = png;
      rasterized = true;
    }
    const demux = IMAGE_DEMUXERS[path.extname(input).toLowerCase()];
    const fmt = demux ? ["-f", demux] : [];
    const probe = await proc.ffprobeJson(["-protocol_whitelist", "file", ...fmt, "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", `file:${input}`], { signal, timeoutMs: 20000 });
    const st = (probe.streams || [])[0];
    const w0 = Number(st && st.width), h0 = Number(st && st.height);
    if (!(w0 > 0 && h0 > 0)) return empty("not a decodable image");
    const k = Math.min(1, MAX_DECODE_EDGE / Math.max(w0, h0));
    const W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
    const raw = path.join(tmpDir, "logo.rgba");
    await proc.ffmpeg(["-y", "-protocol_whitelist", "file", ...fmt, "-i", `file:${input}`, "-frames:v", "1",
      "-vf", `scale=${W}:${H}:flags=neighbor,format=rgba`, "-f", "rawvideo", "-pix_fmt", "rgba", raw], { signal, timeoutMs: 30000, label: "logo-decode" });
    const buf = fs.readFileSync(raw);
    if (buf.length < W * H * 4) return empty("short decode");
    const p = paletteFromRgba(buf, W, H, Math.max(1, Math.min(8, maxColors)));
    return { ...p, width: w0, height: h0, rasterized, skipped: null };
  } catch (e) {
    if (e && e.code === "PROC_ABORTED") throw e;
    return empty(`decode failed: ${(e && e.code) || "error"}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

// ---- palette resolution ---------------------------------------------------------------------------
function colorList(v) {
  if (!v) return [];
  if (typeof v === "string") return [normHex(v)].filter(Boolean);
  if (Array.isArray(v)) return [...new Set(v.map(normHex).filter(Boolean))];
  if (typeof v === "object") {
    if (Array.isArray(v.colors) && !("primary" in v)) return colorList(v.colors);
    return colorList([v.primary, v.accent, v.secondary, ...(Array.isArray(v.colors) ? v.colors : [])]);
  }
  return [];
}

function resolveEditBrand({ userPalette = null, logoPalette = null } = {}, deps = {}) {
  const { defaultBrandSkin } = deps.artDirector || require("../../services/art_director");
  const { resolveBrand } = deps.brandKit || require("../../services/brand_kit");
  if (typeof defaultBrandSkin !== "function" || typeof resolveBrand !== "function") {
    throw new EditError("BRAND_DEPS_MISSING", { errorClass: "bug", detail: "defaultBrandSkin/resolveBrand unavailable" });
  }
  const fitAccent = (skin) => resolveBrand(skin ? { accents: skin.accents, emphasis: skin.emphasis } : null, {
    ground: CAPTION_GROUND, isDark: true, packAccents: [DEFAULT_PALETTE.accent],
  });
  const build = (primary, fitted, source) => ({
    primary: normHex(primary) || DEFAULT_PALETTE.primary,
    accent: normHex(fitted.accent) || DEFAULT_PALETTE.accent,
    text: TEXT_ON_VIDEO,
    onAccent: normHex(fitted.ui && fitted.ui.onAccent) || DEFAULT_PALETTE.onAccent,
    source,
  });

  const user = colorList(userPalette);
  if (user.length) {
    const skin = defaultBrandSkin(user);
    return build(user[0], fitAccent(skin), "user");
  }
  const logo = colorList(logoPalette);
  if (logo.length) {
    const skin = defaultBrandSkin(logo);
    if (skin) return build(skin.accents[0], fitAccent(skin), "logo");
  }
  return { primary: DEFAULT_PALETTE.primary, accent: DEFAULT_PALETTE.accent, text: DEFAULT_PALETTE.text, onAccent: DEFAULT_PALETTE.onAccent, source: "default" };
}

module.exports = { extractLogoPalette, rasterizeSvg, resolveEditBrand, paletteFromRgba, colorList, GRID, ALPHA_MIN };
