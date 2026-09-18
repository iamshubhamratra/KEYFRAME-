// Tests for video_edit/cards/{render,templates/*}.js — HyperFrames motion-graphic cards (RENDER.md §7, spike S4).
// Run: node scripts/video_edit_cards.test.cjs      (VE_CARDS_KEEP=<dir> keeps review PNGs; ~4-8 min: real renders)
//
// Load-bearing:
//   * every template builds the S4 contract (region-sized root/clip, GSAP as a copied FILE, paused timeline registered
//     as "vid", no randomness / clock / infinite repeat, one TTF data-URI @font-face per family) and passes the REAL
//     validator lint with 0 errors plus runtime_check (English, Hindi, Arabic);
//   * text is sized from the bundled TTF's own metrics, and Chrome agrees with those widths;
//   * lower_third and stat render for real: VP9 webm, ALPHA_MODE=1, 75 frames / 2.5 s, first and last frame clear;
//     the alpha composites over red only with -c:v libvpx-vp9 before -i (the native-decoder control shows a black
//     box), panel / accent pixels match the palette, and the stat odometer rolls then settles;
//   * TTF data-URI fonts need no network: the lower_third render runs with the CLI's network blocked, logs no Google
//     Fonts fetch or font injection, and leaves ~/.cache/hyperframes/fonts untouched;
//   * a committed card is reused by hash with zero lint / runtime / spawn calls;
//   * every failure (fault token, lint error, unknown template, render crash, alpha-less output) returns ASS events,
//     and those events burn with libass using only bundled fonts, inside [outIn, outIn + dur) only.

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");

const SERVER_ROOT = path.resolve(__dirname, "..");
const SRC = path.join(SERVER_ROOT, "src");
function stubModule(rel, exportsObj) {
  const file = require.resolve(path.join(SRC, rel));
  const m = new Module(file, null);
  m.filename = file;
  m.loaded = true;
  m.exports = exportsObj;
  require.cache[file] = m;
}
// services/hyperframes_cli.js (used by validator.js and the card render) requires config.js, which loads server/.env.
stubModule("config.js", { paths: { root: SERVER_ROOT }, render: {}, server: {} });

const CR = require("../src/video_edit/cards/render");
const K = require("../src/video_edit/cards/templates/_common");
const STAT = require("../src/video_edit/cards/templates/stat");
const fontname = require("../src/video_edit/captions/fontname");
const A = require("../src/video_edit/captions/ass");
const proc = require("../src/video_edit/engine/proc");
const { EditError } = require("../src/video_edit/errors");
const validator = require("../src/services/validator");
const { runtimeCheck, findChromium } = require("../src/services/runtime_check");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-cards-");
const PROJ = path.join(tmp.dir, "p");
fs.mkdirSync(PROJ, { recursive: true });
const KEEP = process.env.VE_CARDS_KEEP ? path.resolve(process.env.VE_CARDS_KEEP) : null;
const REVIEW = KEEP || path.join(tmp.dir, "review");
fs.mkdirSync(REVIEW, { recursive: true });
const measured = {};

const BRAND = { primary: "#1d3557", accent: "#E832A8", text: "#ffffff", onAccent: "#ffffff", source: "user" };
const LOGO = path.join(tmp.dir, "logo.png");
const TEMPLATES = ["hook_title", "keyword", "stat", "lower_third", "cta", "logo_outro"];
const VARS = {
  lower_third: { title: "Maya Ortiz", subtitle: "Founder, KEYFRAME Studio" },
  hook_title: { title: "Stop editing videos the slow way", subtitle: "Three habits that save hours" },
  keyword: { title: "Consistency" },
  stat: { value: "87%", title: "of viewers watch with sound off" },
  cta: { title: "Follow for more", subtitle: "New edits every week" },
  logo_outro: { title: "KEYFRAME", subtitle: "@keyframe.studio", logoPath: LOGO },
};

// ---- helpers ------------------------------------------------------------------------------------------
function ffRun(args, { cwd, verbose = false } = {}) {
  const head = ["-hide_banner", "-nostdin", "-y", "-loglevel", verbose ? "verbose" : "error"];
  const r = spawnSync("ffmpeg", [...head, ...args], { cwd, windowsHide: true, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}): ${String(r.stderr).slice(-600)}`);
  return r;
}
function ffprobeJson(args) {
  const r = spawnSync("ffprobe", ["-hide_banner", "-v", "error", ...args, "-of", "json"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
const hexRgb = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const blend = (hex, a, bg) => hexRgb(hex).map((c, i) => c * a + bg[i] * (1 - a));
const rgbAt = (buf, W, p) => { const o = (p.y * W + p.x) * 3; return [buf[o], buf[o + 1], buf[o + 2]]; };
const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
function assertNear(actual, expected, tol, what) {
  const d = dist(actual, expected);
  assert.ok(d <= tol, `${what}: got [${actual.map((v) => Math.round(v))}] expected [${expected.map((v) => Math.round(v))}] (max diff ${d.toFixed(1)} > ${tol})`);
}

// Chosen frames of a card composited over a solid colour, as rgb24 buffers keyed by frame index.
let fcsSeq = 0;
function compositeFrames(cardPath, W, H, frames, { bg = "red", decoder = "libvpx", dur = 2.5 } = {}) {
  const sorted = [...new Set(frames)].sort((a, b) => a - b);
  const fcs = path.join(tmp.dir, `comp_${++fcsSeq}.fcs`);
  fs.writeFileSync(fcs, `[0:v]format=rgb24[bg];[1:v]format=rgba[c];[bg][c]overlay=0:0:format=rgb:eof_action=pass,select='${sorted.map((n) => `eq(n\\,${n})`).join("+")}',format=rgb24[o]\n`);
  const r = ffRun(["-f", "lavfi", "-i", `color=c=${bg}:s=${W}x${H}:r=30:d=${dur}`, ...(decoder === "libvpx" ? ["-c:v", "libvpx-vp9"] : []), "-i", cardPath,
    "-/filter_complex", fcs, "-map", "[o]", "-fps_mode", "passthrough", "-f", "rawvideo", "-"]);
  const size = W * H * 3;
  assert.equal(r.stdout.length, size * sorted.length, `composite returned ${r.stdout.length / size} frames, wanted ${sorted.length}`);
  return new Map(sorted.map((n, i) => [n, r.stdout.subarray(i * size, (i + 1) * size)]));
}
function savePng(buf, W, H, name) {
  const raw = path.join(tmp.dir, `${name}.rgb`);
  fs.writeFileSync(raw, buf);
  ffRun(["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", raw, "-frames:v", "1", "-update", "1", path.join(REVIEW, `${name}.png`)]);
  fs.unlinkSync(raw);
}
function boxDiff(a, b, W, bx) {
  let sum = 0, n = 0;
  for (let y = Math.max(0, Math.floor(bx.y)); y < Math.floor(bx.y + bx.h); y++) {
    for (let x = Math.max(0, Math.floor(bx.x)); x < Math.floor(bx.x + bx.w); x++) {
      const o = (y * W + x) * 3;
      sum += Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]);
      n += 3;
    }
  }
  return sum / Math.max(1, n);
}
function countUnlike(buf, W, H, rgb, tol, region = { x: 0, y: 0, w: W, h: H }) {
  let n = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const o = (y * W + x) * 3;
      if (Math.abs(buf[o] - rgb[0]) > tol || Math.abs(buf[o + 1] - rgb[1]) > tol || Math.abs(buf[o + 2] - rgb[2]) > tol) n++;
    }
  }
  return n;
}

const fontsFor = (id, lang = "en", brandFont = null) => CR.resolveCardFonts(CR.getTemplate(id), { lang, brandFont });
function buildCard(id, { aspect = "9:16", lang = "en", vars = VARS[id], dur = 2.5, brand = BRAND } = {}) {
  const tpl = CR.getTemplate(id);
  const dims = tpl.defaultDims(aspect);
  return { tpl, dims, built: tpl.build(vars, brand, fontsFor(id, lang), { ...dims, dur, lang }) };
}
const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const externalScripts = (html) => [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/gi)].map((m) => m[1]);
const styleText = (html) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
function fontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => ({
    family: (/font-family:\s*'([^']+)'/.exec(m[1]) || [])[1],
    b64: (/src:\s*url\(data:font\/ttf;base64,([A-Za-z0-9+/=]+)\)/.exec(m[1]) || [])[1],
    weight: Number((/font-weight:\s*(\d+)/.exec(m[1]) || [])[1]),
  }));
}
function usedFamilyDecls(css) {
  const body = css.replace(/@font-face\s*\{[^}]*\}/g, "");
  return [...body.matchAll(/font-family:\s*([^;}{]+);\s*font-weight:\s*(\d+)/g)].map((m) => ({
    families: m[1].split(",").map((p) => p.trim().replace(/^['"]|['"]$/g, "")).filter((n) => n && n !== "sans-serif"),
    weight: Number(m[2]),
  }));
}
function spyDeps(extra = {}) {
  const calls = { validate: 0, runtimeCheck: 0, runProcess: 0 };
  const deps = {
    validate: async (d, f) => { calls.validate++; return validator.validate(d, f); },
    runtimeCheck: async (d) => { calls.runtimeCheck++; return runtimeCheck(d); },
    runProcess: (c, a, o) => { calls.runProcess++; return proc.runProcess(c, a, o); },
    ...extra,
  };
  return { calls, deps };
}
function snapshotDir(dir) {
  const out = {};
  const walk = (d, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { out[`${r}/`] = "dir"; walk(p, r); } else { const st = fs.statSync(p); out[r] = `${st.size}:${st.mtimeMs}`; }
    }
  };
  walk(dir, "");
  return out;
}
const fontCacheDir = () => process.env.HYPERFRAMES_FONT_CACHE_DIR || path.join(os.homedir(), ".cache", "hyperframes", "fonts");
const vecardDirs = () => { try { return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("vecard-")).sort(); } catch { return []; } };

// Preloaded into the CLI's Node processes: refuses every non-loopback DNS lookup, socket and fetch, and logs it
// (the spike S4 block_net.cjs). Written without template literals or escapes so it can be embedded verbatim.
const BLOCK_NET_SRC = String.raw`
const fs = require("fs"); const net = require("net"); const dns = require("dns");
const LOG = process.env.BLOCK_NET_LOG || "block_net.log";
const SUB = process.argv[2] || "?";
function note(kind, target) { try { fs.appendFileSync(LOG, "BLOCKED " + kind + " " + target + " [" + SUB + "]" + String.fromCharCode(10)); } catch (e) {} }
function loop(host) { if (!host) return true; const h = String(host).toLowerCase().replace(/^\[|\]$/g, ""); return h === "localhost" || h === "::1" || h.indexOf("127.") === 0 || h === "0.0.0.0"; }
const oc = net.Socket.prototype.connect;
net.Socket.prototype.connect = function () {
  let o = arguments[0]; if (Array.isArray(o)) o = o[0];
  let host, port, p;
  if (o && typeof o === "object") { host = o.host; port = o.port; p = o.path; }
  else if (typeof o === "number" || /^\d+$/.test(String(o))) { port = o; host = typeof arguments[1] === "string" ? arguments[1] : "localhost"; }
  else if (typeof o === "string") { p = o; }
  if (!p && !loop(host)) { note("net.connect", host + ":" + port); const err = Object.assign(new Error("network disabled"), { code: "ECONNREFUSED" }); process.nextTick(() => this.destroy(err)); return this; }
  return oc.apply(this, arguments);
};
const ol = dns.lookup;
dns.lookup = function (hostname, options, cb) { if (typeof options === "function") { cb = options; options = {}; } if (!loop(hostname)) { note("dns.lookup", hostname); return process.nextTick(() => cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }))); } return ol.call(dns, hostname, options, cb); };
if (typeof globalThis.fetch === "function") { const of = globalThis.fetch; globalThis.fetch = async function (input, init) { let u = null; try { u = new URL(typeof input === "string" ? input : (input && input.url) || String(input)); } catch (e) {} if (u && /^https?:$/.test(u.protocol) && !loop(u.hostname)) { note("fetch", u.href.slice(0, 200)); throw new TypeError("fetch failed: network disabled"); } return of.call(this, input, init); }; }
note("preload-active", process.argv.slice(1, 3).join(" "));
`;

// ---- fixtures ------------------------------------------------------------------------------------------
ffRun(["-f", "lavfi", "-i", "color=c=black@0:s=256x256,format=rgba", "-vf", "geq=r='255':g='255':b='255':a='if(lt(hypot(X-128,Y-128),100),255,0)'", "-frames:v", "1", LOGO]);

// ======================================================================================================
section("templates — build contract (no render)");

t("registry: six templates with id / version / fontRoles / defaultDims / build / fallbackBlocks; plan kinds map to them", () => {
  assert.deepEqual([...CR.TEMPLATE_IDS].sort(), [...TEMPLATES].sort());
  for (const id of TEMPLATES) {
    const tpl = CR.getTemplate(id);
    assert.equal(tpl.id, id);
    assert.ok(Number.isInteger(tpl.version) && tpl.version >= 1);
    assert.equal(typeof tpl.build, "function");
    assert.equal(typeof tpl.fallbackBlocks, "function");
    assert.ok(tpl.fontRoles && fontname.entryForFamily(tpl.fontRoles.display) && fontname.entryForFamily(tpl.fontRoles.body));
    for (const aspect of ["9:16", "16:9", "1:1"]) {
      const d = tpl.defaultDims(aspect);
      assert.ok(Number.isInteger(d.w) && Number.isInteger(d.h) && d.w % 2 === 0 && d.h % 2 === 0, `${id} ${aspect} dims even`);
      assert.ok(d.w <= 1920 && d.h <= 1920 && d.w * d.h < 1920 * 1080 * 0.8, `${id} ${aspect} is region-sized (${d.w}x${d.h})`);
    }
  }
  for (const [kind, id] of Object.entries(CR.KIND_TO_TEMPLATE)) assert.equal(CR.getTemplate(kind).id, id);
  assert.equal(CR.getTemplate("nope"), null);
});

t("every template × aspect builds the S4 contract: root/clip, GSAP file, deterministic paused timeline, meta, extra files, boxes in frame", () => {
  for (const id of TEMPLATES) {
    for (const aspect of ["9:16", "16:9", "1:1"]) {
      const { built, dims } = buildCard(id, { aspect });
      const html = built.indexHtml;
      const tag = `${id} ${aspect}`;
      assert.ok(html.includes(`<div id="root" data-composition-id="vid" data-width="${dims.w}" data-height="${dims.h}" data-start="0" data-duration="2.5">`), `${tag} root`);
      assert.ok(html.includes('<div id="card" class="clip" data-start="0" data-duration="2.5" data-track-index="0">'), `${tag} clip`);
      assert.deepEqual(externalScripts(html), ["gsap.min.js"], `${tag} GSAP is loaded as a file`);
      const inl = inlineScripts(html);
      assert.equal(inl.length, 1, `${tag} one inline script`);
      assert.ok(inl[0].length < 8000, `${tag} GSAP is not inlined (${inl[0].length} chars)`);
      assert.ok(!/Math\.random|Date\.now|new Date|performance\.now|repeat\s*:\s*-1/.test(inl[0]), `${tag} forbidden token`);
      assert.ok(inl[0].includes("const tl = gsap.timeline({ paused: true });") && inl[0].includes('window.__timelines["vid"] = tl;'), `${tag} timeline registration`);
      assert.ok(!/visibility\s*:\s*hidden|display\s*:\s*none/.test(html), `${tag} hidden state is opacity only`);
      assert.ok(!/https?:\/\/|\/\/fonts\.|@import/i.test(html), `${tag} no URLs`);
      assert.ok(/html, body \{[^}]*background: transparent;/.test(styleText(html)) && /#root \{[^}]*background: transparent;/.test(styleText(html)), `${tag} transparent ground`);
      assert.deepEqual(JSON.parse(built.metaJson), { compositionId: "vid", width: dims.w, height: dims.h, fps: 30, duration: 2.5 }, `${tag} meta`);
      assert.equal(built.extraFiles[0].rel, "gsap.min.js");
      assert.equal(path.resolve(built.extraFiles[0].srcPath), path.resolve(SERVER_ROOT, "node_modules", "gsap", "dist", "gsap.min.js"));
      if (id === "logo_outro") assert.deepEqual(built.extraFiles.slice(1).map((f) => f.rel), ["logo.png"]);
      assert.equal(built.layout.truncated, false, `${tag} sample text fits without truncation`);
      for (const [name, bx] of Object.entries(built.layout.boxes)) {
        if (!bx) continue;
        assert.ok(bx.x >= -1 && bx.y >= -1 && bx.x + bx.w <= dims.w + 1 && bx.y + bx.h <= dims.h + 1, `${tag} box ${name} inside ${dims.w}x${dims.h}: ${JSON.stringify(bx)}`);
      }
      assert.equal(buildCard(id, { aspect }).built.indexHtml, html, `${tag} build is deterministic`);
    }
  }
});

t("every family used in CSS has one data-URI @font-face whose base64 is the bundled TTF, at the face's own weight", () => {
  const cases = [...TEMPLATES.map((id) => [id, "en"]), ["hook_title", "hi"], ["lower_third", "ar"], ["keyword", "ja"]];
  const vars = { hook_title: { title: "वीडियो एडिटिंग का तेज़ तरीका", subtitle: "तीन आदतें KEYFRAME" }, lower_third: { title: "مايا أورتيز", subtitle: "مؤسسة KEYFRAME" }, keyword: { title: "一貫性" } };
  for (const [id, lang] of cases) {
    const { built } = buildCard(id, { lang, vars: lang === "en" ? VARS[id] : vars[id] });
    const css = styleText(built.indexHtml);
    const faces = fontFaces(css);
    const declared = faces.map((f) => f.family);
    assert.equal(new Set(declared).size, declared.length, `${id}/${lang} one face per family`);
    for (const f of faces) {
      const e = fontname.entryForFamily(f.family);
      assert.ok(e, `${f.family} is bundled`);
      assert.ok(Buffer.from(f.b64, "base64").equals(fs.readFileSync(path.join(fontname.FONTS_DIR_ABS, e.file))), `${id}/${lang} ${f.family} data URI is the TTF`);
      assert.equal(f.weight, e.weight, `${f.family} face weight`);
    }
    const decls = usedFamilyDecls(css);
    assert.ok(decls.length >= 1, `${id}/${lang} declares fonts`);
    for (const d of decls) {
      for (const fam of d.families) assert.ok(declared.includes(fam), `${id}/${lang} '${fam}' used without @font-face`);
      assert.equal(d.weight, fontname.entryForFamily(d.families[0]).weight, `${id}/${lang} element weight matches its first face (no synthetic bold)`);
    }
    if (lang === "hi") assert.ok(declared.includes("Noto Sans Devanagari") && declared.includes("DM Sans"));
    if (lang === "ar") assert.ok(declared.includes("Noto Sans Arabic") && declared.includes("DM Sans") && css.includes("direction: rtl"));
    if (lang === "ja") assert.deepEqual(declared, ["Noto Sans JP"]);
  }
});

t("text is fitted from TTF metrics: long text shrinks and wraps inside the region; impossible text is ellipsized", () => {
  const tpl = CR.getTemplate("lower_third");
  const long = tpl.build({ title: "Dr. Maximiliana Konstantinopoulos-Wetherby", subtitle: "Chief Executive Officer and Co-Founder" }, BRAND, fontsFor("lower_third"), { w: 1080, h: 340, dur: 2.5 });
  const short = tpl.build(VARS.lower_third, BRAND, fontsFor("lower_third"), { w: 1080, h: 340, dur: 2.5 });
  assert.ok(long.layout.sizes.title < short.layout.sizes.title, `long title shrinks (${long.layout.sizes.title} < ${short.layout.sizes.title})`);
  assert.ok(long.layout.boxes.panel.x + long.layout.boxes.panel.w <= 1080 - 55, "panel stays inside the side margin");

  const chain = [K.metricsFor(path.join(fontname.FONTS_DIR_ABS, "ArchivoBlack-Regular.ttf"))];
  assert.ok(K.measureEm("WWWW", chain) > K.measureEm("iiii", chain) * 2);
  const two = K.fitText({ text: "STOP EDITING VIDEOS THE SLOW WAY", chain, maxWidth: 900, maxLines: 2, maxSize: 200, minSize: 20 });
  assert.equal(two.lines.length, 2);
  assert.ok(two.width <= 900 * 0.97 + 0.5, `fits (${two.width})`);
  const [a, b] = two.lines.map((l) => l.width);
  assert.ok(Math.min(a, b) / Math.max(a, b) > 0.6, `balanced lines ${a} / ${b}`);
  for (const l of two.lines) assert.ok(Math.abs(l.width - K.measureEm(l.text, chain) * two.size) < 1);
  const bigger = K.fitText({ text: "STOP EDITING VIDEOS THE SLOW WAY", chain, maxWidth: 900, maxLines: 2, maxSize: two.size + 1, minSize: two.size + 1 });
  assert.ok(bigger.truncated || bigger.width > 900 * 0.97, "size is the largest that fits");

  const cut = K.fitText({ text: "Supercalifragilisticexpialidocious ".repeat(6), chain, maxWidth: 400, maxLines: 1, maxSize: 60, minSize: 40 });
  assert.equal(cut.truncated, true);
  assert.equal(cut.lines.length, 1);
  assert.ok(cut.lines[0].text.endsWith("…") && cut.width <= 400 * 0.97 + 0.5, JSON.stringify(cut.lines));

  const ja = K.fitText({ text: "動画編集をもっと速く", chain: [K.metricsFor(path.join(fontname.FONTS_DIR_ABS, "NotoSansJP-Bold.ttf"))], maxWidth: 300, maxLines: 2, maxSize: 80, minSize: 20, lang: "ja" });
  assert.equal(ja.joiner, "");
  assert.equal(ja.lines.map((l) => l.text).join(""), "動画編集をもっと速く");
});

t("vars are HTML-escaped: hostile text cannot inject markup, styles or scripts", () => {
  const evil = `<script>alert(1)</script> & "q" 'x'`;
  for (const id of ["lower_third", "hook_title", "cta"]) {
    const { built } = buildCard(id, { vars: { title: evil, subtitle: "</style><img src=x onerror=alert(2)>" } });
    const html = built.indexHtml;
    assert.ok(!html.includes("<script>alert") && !html.includes("<img src=x") && !html.includes("</style><img"), `${id} raw markup leaked`);
    assert.ok(html.includes("&lt;/style&gt;&lt;img src=x onerror=alert(2)&gt;"), `${id} subtitle escaped`);
    assert.deepEqual(externalScripts(html), ["gsap.min.js"]);
    assert.equal(inlineScripts(html).length, 1);
  }
});

t("stat: parseValue handles prefix / suffix / decimals / group separators; odometer strips end on their digit with one cell height", () => {
  const P = (v) => { const r = STAT.parseValue(v); return r && { prefix: r.prefix, suffix: r.suffix, digits: r.parts.filter((p) => p.kind === "digit").map((p) => p.d), statics: r.parts.filter((p) => p.kind === "static").map((p) => p.text) }; };
  assert.deepEqual(P("87%"), { prefix: "", suffix: "%", digits: [8, 7], statics: [] });
  assert.deepEqual(P("$2.4M"), { prefix: "$", suffix: "M", digits: [2, 4], statics: ["."] });
  assert.deepEqual(P("3,000+"), { prefix: "", suffix: "+", digits: [3, 0, 0, 0], statics: [","] });
  assert.deepEqual(P("10x"), { prefix: "", suffix: "x", digits: [1, 0], statics: [] });
  assert.equal(STAT.parseValue("N/A"), null);
  assert.equal(STAT.parseValue("24/7"), null);
  assert.equal(STAT.parseValue("1234567890"), null);

  const { built } = buildCard("stat");
  const html = built.indexHtml;
  const strips = [...html.matchAll(/<span class="strip" id="(stS\d)">((?:<span>\d<\/span>)+)<\/span>/g)].map((m) => ({ id: m[1], cells: [...m[2].matchAll(/<span>(\d)<\/span>/g)].map((x) => Number(x[1])) }));
  assert.deepEqual(strips.map((s) => s.id), ["stS0", "stS1"]);
  assert.deepEqual(strips.map((s) => s.cells[s.cells.length - 1]), [8, 7], "strips end on 8 and 7");
  assert.deepEqual(strips.map((s) => s.cells.length), [10 + 9, 20 + 8], "tens spin once, units twice");
  const travel = strips.map((s) => Number(new RegExp(`tl\\.fromTo\\("#${s.id}", \\{"y":0\\}, \\{"y":(-[\\d.]+)`).exec(inlineScripts(html)[0])[1]));
  const cellH = travel.map((y, i) => -y / (strips[i].cells.length - 1));
  assert.ok(Math.abs(cellH[0] - cellH[1]) < 0.01, `same cell height ${cellH}`);
  const vh = Number(/#stVal \.dg \{[^}]*height: ([\d.]+)px/.exec(styleText(html))[1]);
  assert.ok(Math.abs(cellH[0] - vh) < 0.01, `travel = (cells-1) × window height (${cellH[0]} vs ${vh})`);
  const noDigits = buildCard("stat", { vars: { value: "N/A", title: "not measured" } }).built;
  assert.ok(!noDigits.indexHtml.includes('class="strip"') && noDigits.indexHtml.includes("N/A"));
});

t("fonts: hi / ar use the script face plus DM Sans for Latin runs, ja uses Noto Sans JP alone, brandFont swaps only brand-display templates", () => {
  const fam = (list) => list.map((f) => `${f.role}:${f.family}`);
  assert.deepEqual(fam(fontsFor("hook_title", "hi")), ["display:Noto Sans Devanagari", "body:Noto Sans Devanagari", "fallback:DM Sans"]);
  assert.deepEqual(fam(fontsFor("stat", "ar")), ["display:Noto Sans Arabic", "body:Noto Sans Arabic", "fallback:DM Sans"]);
  assert.deepEqual(fam(fontsFor("cta", "ja")), ["display:Noto Sans JP", "body:Noto Sans JP"]);
  assert.deepEqual(fam(fontsFor("hook_title", "en", { family: "Anton" })), ["display:Anton", "body:DM Sans"]);
  assert.deepEqual(fam(fontsFor("lower_third", "en", { family: "Anton" })), ["display:Figtree", "body:DM Sans"]);
  assert.deepEqual(fam(fontsFor("hook_title", "en", { family: "Noto Sans JP" })), ["display:Archivo Black", "body:DM Sans"]);
  for (const f of fontsFor("hook_title", "hi")) assert.ok(fs.existsSync(f.ttfPath));
  const ar = buildCard("lower_third", { lang: "ar", vars: { title: "مايا أورتيز", subtitle: "مؤسسة KEYFRAME" } }).built;
  assert.ok(Math.abs(ar.layout.boxes.panel.x + ar.layout.boxes.panel.w - (1080 - 56)) < 1, "RTL strap is anchored right");
  assert.ok(ar.indexHtml.startsWith('<!doctype html>\n<html lang="ar">'));
});

t("cardHash is deterministic and key-order independent, and changes with every input that changes pixels", () => {
  const base = { template: "lower_third", vars: { title: "A", subtitle: "B" }, brand: BRAND, fonts: fontsFor("lower_third"), w: 1080, h: 340, dur: 2.5 };
  const h0 = CR.cardHashFor(base);
  assert.match(h0, /^[0-9a-f]{40}$/);
  assert.equal(CR.cardHashFor({ ...base }), h0);
  assert.equal(CR.cardHashFor({ ...base, vars: { subtitle: "B", title: "A" } }), h0, "vars key order");
  assert.equal(CR.cardHashFor({ ...base, brand: { onAccent: "#FFFFFF", text: "#FFFFFF", accent: "#e832a8", primary: "#1D3557" } }), h0, "palette case/order");
  assert.equal(CR.cardHashFor({ ...base, dur: 2.52 }), h0, "duration snaps to 0.1 s");
  const logo2 = path.join(tmp.dir, "logo2.png");
  fs.writeFileSync(logo2, Buffer.concat([fs.readFileSync(LOGO), Buffer.from([0])]));
  const variants = {
    title: { vars: { title: "A2", subtitle: "B" } },
    accent: { brand: { ...BRAND, accent: "#00AAFF" } },
    width: { w: 1082 },
    height: { h: 342 },
    dur: { dur: 3 },
    fonts: { fonts: fontsFor("lower_third", "hi") },
    template: { template: "cta" },
    version: { template: { ...CR.getTemplate("lower_third"), version: 99 } },
    logo: { vars: { title: "A", subtitle: "B", logoPath: LOGO } },
  };
  const seen = new Set([h0]);
  for (const [name, v] of Object.entries(variants)) {
    const hv = CR.cardHashFor({ ...base, ...v });
    assert.ok(!seen.has(hv), `hash must change for ${name}`);
    seen.add(hv);
  }
  assert.notEqual(CR.cardHashFor({ ...base, vars: { title: "A", subtitle: "B", logoPath: LOGO } }), CR.cardHashFor({ ...base, vars: { title: "A", subtitle: "B", logoPath: logo2 } }), "logo bytes");
});

t("timing and geometry: watchdog max(120 s, dur × 40 s), 0.1 s duration grid, even dims, short cards finish before their last frames", () => {
  assert.equal(CR.watchdogMsFor(2.5), 120000);
  assert.equal(CR.watchdogMsFor(5), 200000);
  assert.equal(CR.watchdogMsFor(12), 480000);
  assert.equal(CR.snapDur(2.46), 2.5);
  assert.equal(CR.snapDur(0.2), 1);
  assert.equal(CR.snapDur(99), 12);
  assert.deepEqual(CR.normDims({ w: 1081, h: 339 }), { w: 1080, h: 338 });
  for (const id of TEMPLATES) {
    for (const dur of [1, 2.5, 6]) {
      const { built } = buildCard(id, { dur });
      const end = dur - 1 / 30 + 1e-6;
      for (const line of inlineScripts(built.indexHtml)[0].split("\n")) {
        const m = /^tl\.(?:fromTo|to)\(.*"duration":([\d.]+)[^)]*\), ([\d.]+)\);$/.exec(line);
        if (!m) continue;
        const stagger = /"stagger":([\d.]+)/.exec(line);
        const finish = Number(m[2]) + Number(m[1]) + (stagger ? Number(stagger[1]) : 0);
        assert.ok(finish <= end, `${id} @${dur}s tween ends at ${finish.toFixed(3)} > ${end.toFixed(3)}: ${line.slice(0, 90)}`);
      }
      assert.ok(built.layout.holdSec[0] < built.layout.holdSec[1], `${id} @${dur}s has a hold`);
    }
  }
});

t("palette: on-accent text ≥ 4.5:1 on the accent, accent lifted to ≥ 3:1 on the dark panel, defaults from the plan schema", () => {
  const P = K.derivePalette({ accent: "#1d3557", onAccent: "#1d3557", text: "#222222" });
  assert.ok(K.contrastRatio(P.onAccent, P.accent) >= 4.5, P.onAccent);
  assert.ok(K.contrastRatio(P.accentOnDark, P.panel) >= 3, P.accentOnDark);
  assert.equal(P.textOnPanel, "#ffffff");
  const D = K.derivePalette(null);
  assert.deepEqual({ accent: D.accent, onAccent: D.onAccent }, { accent: "#ffd400", onAccent: "#14130e" });
});

// ======================================================================================================
section("gates — real validator lint + runtime_check, and Chrome agrees with the TTF metrics");

t("all six templates (+ hook_title in Hindi, lower_third in Arabic) pass lint with 0 errors and runtime_check (not skipped)", async () => {
  const cases = [...TEMPLATES.map((id) => ({ id, lang: "en", vars: VARS[id] })),
    { id: "hook_title", lang: "hi", vars: { title: "वीडियो एडिटिंग का तेज़ तरीका", subtitle: "तीन आदतें KEYFRAME" } },
    { id: "lower_third", lang: "ar", vars: { title: "مايا أورتيز", subtitle: "مؤسسة KEYFRAME" } }];
  measured.gates = {};
  for (const c of cases) {
    const { built } = buildCard(c.id, { lang: c.lang, vars: c.vars });
    const dir = path.join(tmp.dir, "gates", `${c.id}_${c.lang}`);
    CR.prepareCardDir(dir, built);
    const t0 = Date.now();
    const v = await validator.validate(dir, { indexHtml: built.indexHtml, metaJson: built.metaJson });
    const lintMs = Date.now() - t0;
    assert.ok(v.parsed, `${c.id}/${c.lang} lint output parsed`);
    assert.equal(v.errorCount, 0, `${c.id}/${c.lang} lint errors: ${JSON.stringify(v.errors)}`);
    assert.ok(v.ok);
    const t1 = Date.now();
    const rc = await runtimeCheck(dir);
    assert.ok(rc.ok && !rc.skipped, `${c.id}/${c.lang} runtime_check: ${JSON.stringify(rc)}`);
    measured.gates[`${c.id}/${c.lang}`] = { lintMs, runtimeMs: Date.now() - t1, warnings: v.warningCount };
  }
});

t("Chrome's advance widths for the bundled faces agree with the Node TTF measurement (-6 % … +1 %)", async () => {
  const puppeteer = require("puppeteer-core");
  const exe = findChromium();
  assert.ok(exe, "a puppeteer Chrome is required");
  const samples = [
    { family: "Archivo Black", text: "STOP EDITING VIDEOS" }, { family: "Anton", text: "CONSISTENCY" },
    { family: "DM Sans", text: "Founder, KEYFRAME Studio" }, { family: "Figtree", text: "Maya Ortiz" },
    { family: "Noto Sans JP", text: "動画編集をもっと速く" },
  ];
  const faces = [...new Set(samples.map((s) => s.family))].map((family) => {
    const e = fontname.entryForFamily(family);
    return { family: e.family, ttfPath: path.join(fontname.FONTS_DIR_ABS, e.file), weight: e.weight };
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${K.fontFaceCss(faces)} body{margin:0} span{position:absolute;left:0;white-space:pre;font-size:100px;font-synthesis:none}</style></head><body>${samples.map((s, i) => `<span id="s${i}" style="top:${i * 140}px;font-family:'${s.family}';font-weight:${faces.find((f) => f.family === s.family).weight}">${K.escapeHtml(s.text)}</span>`).join("")}</body></html>`;
  const browser = await puppeteer.launch({ executablePath: exe, headless: "shell", args: ["--no-sandbox"] });
  let res;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    res = await page.evaluate(async (n, fams) => {
      await document.fonts.ready;
      return {
        widths: Array.from({ length: n }, (_, i) => document.getElementById(`s${i}`).getBoundingClientRect().width),
        loaded: fams.map((f) => [...document.fonts].some((ff) => ff.family.replace(/['"]/g, "") === f && ff.status === "loaded")),
      };
    }, samples.length, faces.map((f) => f.family));
  } finally { await browser.close(); }
  assert.ok(res.loaded.every(Boolean), `every data-URI face loaded: ${res.loaded}`);
  measured.chromeWidthRatio = {};
  samples.forEach((s, i) => {
    const ours = K.measureEm(s.text, [K.metricsFor(faces.find((f) => f.family === s.family).ttfPath)]) * 100;
    const ratio = res.widths[i] / ours;
    measured.chromeWidthRatio[s.family] = Number(ratio.toFixed(4));
    assert.ok(ratio <= 1.01 && ratio >= 0.94, `${s.family} "${s.text}": chrome ${res.widths[i].toFixed(1)} vs ttf ${ours.toFixed(1)} (${ratio.toFixed(3)})`);
  });
});

// ======================================================================================================
section("render — real HyperFrames webm");

let LT = null;

t("lower_third renders with the CLI's network blocked: VP9 alpha webm, 75 frames / 2.5 s, no font fetch or injection, font cache untouched", async () => {
  const preload = path.join(tmp.dir, "block_net.cjs");
  const netLog = path.join(tmp.dir, "block_net.log");
  fs.writeFileSync(preload, BLOCK_NET_SRC);
  const cacheBefore = snapshotDir(fontCacheDir());
  const workBefore = vecardDirs();
  const saved = { NODE_OPTIONS: process.env.NODE_OPTIONS, BLOCK_NET_LOG: process.env.BLOCK_NET_LOG };
  // NODE_OPTIONS treats a backslash inside quotes as an escape, so the Windows path is passed with forward slashes.
  process.env.NODE_OPTIONS = `${saved.NODE_OPTIONS ? `${saved.NODE_OPTIONS} ` : ""}--require "${preload.split(path.sep).join("/")}"`;
  process.env.BLOCK_NET_LOG = netLog;
  let r;
  try {
    r = await CR.renderCard({ template: "lower_third", vars: VARS.lower_third, brand: BRAND, dur: 2.5, projectDir: PROJ, runId: "lt1", aspect: "9:16", pidFile: null });
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  assert.ok(r.ok, `render failed: ${r.reason} ${r.detail}`);
  LT = r;
  assert.equal(r.format, "webm");
  assert.equal(r.cached, false);
  assert.equal(r.fallback, null);
  assert.equal(r.path, path.join(PROJ, "render", "cards", r.cardHash, "out.webm"));
  assert.equal(r.relPath, `render/cards/${r.cardHash}/out.webm`);
  assert.deepEqual(fs.readdirSync(path.dirname(r.path)).sort(), ["card.json", "gsap.min.js", "index.html", "meta.json", "out.webm"]);
  assert.deepEqual(vecardDirs(), workBefore, "the short render work dir is removed");

  const lines = fs.readFileSync(netLog, "utf8").trim().split(/\r?\n/);
  assert.ok(lines.some((l) => l.startsWith("BLOCKED preload-active") && l.includes(" render")), `the preload ran inside the render CLI: ${lines}`);
  const attempts = lines.filter((l) => !l.startsWith("BLOCKED preload-active"));
  assert.deepEqual(attempts.filter((l) => l.endsWith("[render]")), [], "the render CLI (telemetry off, data-URI fonts) makes no network attempt");
  // services/validator.js (read-only here) spawns `lint` without HYPERFRAMES_NO_TELEMETRY; its only allowed attempt is telemetry.
  assert.deepEqual(attempts.filter((l) => !/us\.i\.posthog\.com/.test(l)), [], `no font or other fetch from any CLI child: ${attempts}`);
  measured.blockedNetwork = attempts;
  assert.deepEqual(r.fontLog, { fetched: false, injected: false }, "the compiler neither fetched nor injected fonts");
  const cacheAfter = snapshotDir(fontCacheDir());
  assert.deepEqual(cacheAfter, cacheBefore, "~/.cache/hyperframes/fonts unchanged");
  for (const slug of ["figtree", "dm-sans"]) {
    if (!(`${slug}/` in cacheBefore)) assert.ok(!fs.existsSync(path.join(fontCacheDir(), slug)), `no cache dir for ${slug}`);
  }

  const pr = ffprobeJson(["-count_frames", "-select_streams", "v:0", "-show_streams", "-show_format", r.path]);
  const st = pr.streams[0];
  assert.equal(st.codec_name, "vp9");
  assert.equal(st.width, 1080);
  assert.equal(st.height, 340);
  assert.equal(String((st.tags || {}).ALPHA_MODE), "1");
  assert.equal(Number(st.nb_read_frames), 75);
  assert.ok(Math.abs(Number(pr.format.duration) - 2.5) <= 1 / 30, `format duration ${pr.format.duration}`);
  assert.ok(r.alpha.firstAvg <= 1 && r.alpha.lastAvg <= 1 && r.alpha.maxYmax >= 250 && r.alpha.minYmin === 0, JSON.stringify(r.alpha));
  measured.lowerThird = { timings: r.timings, bytes: r.bytes, frames: r.frames, formatDuration: Number(pr.format.duration), alpha: r.alpha, attempts: r.attempts };
});

t("lower_third alpha composites over red only with -c:v libvpx-vp9 before -i; panel and accent pixels match the palette; clear edges", () => {
  assert.ok(LT, "needs the lower_third render");
  const { w: W, h: H, layout: L } = LT;
  const hold = Math.round(((L.holdSec[0] + L.holdSec[1]) / 2) * 30);
  const frames = compositeFrames(LT.path, W, H, [0, hold, 74]);
  const red = [255, 0, 0];
  for (const n of [0, 74]) assert.equal(countUnlike(frames.get(n), W, H, red, 10), 0, `frame ${n} is fully clear`);
  const f = frames.get(hold);
  assertNear(rgbAt(f, W, L.samples.transparent), red, 6, "transparent area shows the background");
  const panelExpected = blend(L.colors.panel, L.colors.panelAlpha, red);
  const accentExpected = hexRgb(L.colors.accent);
  const panelGot = rgbAt(f, W, L.samples.panel), accentGot = rgbAt(f, W, L.samples.accent);
  assertNear(panelGot, panelExpected, 14, "panel = 0.9 × panel colour over red");
  assertNear(accentGot, accentExpected, 14, "accent bar");
  const ink = countUnlike(f, W, H, red, 10, { x: Math.round(L.boxes.title.x), y: Math.round(L.boxes.title.y), w: Math.round(L.boxes.title.w), h: Math.round(L.boxes.title.h) });
  assert.ok(ink > 1000, `the title area is drawn (${ink} px)`);
  savePng(f, W, H, "lower_third_hold_over_red");
  const native = compositeFrames(LT.path, W, H, [hold], { decoder: "native" }).get(hold);
  assertNear(rgbAt(native, W, L.samples.transparent), [0, 0, 0], 8, "native vp9 decoder control composites a black box");
  savePng(native, W, H, "lower_third_hold_native_decoder");
  const grey = compositeFrames(LT.path, W, H, [Math.round(0.35 * 30), hold], { bg: "0x6a7f8c" });
  savePng(grey.get(hold), W, H, "lower_third_hold_over_grey");
  savePng(grey.get(Math.round(0.35 * 30)), W, H, "lower_third_entry_over_grey");
  measured.lowerThirdPixels = { holdFrame: hold, panel: { got: panelGot, expected: panelExpected.map(Math.round) }, accent: { got: accentGot, expected: accentExpected } };
});

t("stat renders; the odometer rolls (value box changes mid-roll) then settles (identical across the hold); bar and panel colours", async () => {
  const r = await CR.renderCard({ template: "stat", vars: VARS.stat, brand: BRAND, dur: 2.5, projectDir: PROJ, runId: "st1", pidFile: null });
  assert.ok(r.ok, `stat render failed: ${r.reason} ${r.detail}`);
  assert.equal(r.frames, 75);
  const pr = ffprobeJson(["-show_streams", "-show_format", r.path]);
  assert.equal(String((pr.streams[0].tags || {}).ALPHA_MODE), "1");
  assert.ok(Math.abs(Number(pr.format.duration) - 2.5) <= 1 / 30);
  const { w: W, h: H, layout: L } = r;
  const [r0, r1] = L.rollSec;
  const nMid = Math.round((r0 + (r1 - r0) * 0.6) * 30);
  const nH1 = Math.ceil(r1 * 30) + 2;
  const nH2 = Math.floor(L.holdSec[1] * 30) - 1;
  assert.ok(nH2 - nH1 >= 5, `hold window ${nH1}..${nH2}`);
  const red = [255, 0, 0];
  const frames = compositeFrames(r.path, W, H, [nMid, nH1, nH2]);
  const settled = boxDiff(frames.get(nH1), frames.get(nH2), W, L.boxes.value);
  const rolling = boxDiff(frames.get(nMid), frames.get(nH1), W, L.boxes.value);
  assert.ok(settled <= 1.0, `value settled across the hold (mean diff ${settled.toFixed(2)})`);
  assert.ok(rolling >= 5, `value still rolling at frame ${nMid} (mean diff ${rolling.toFixed(2)})`);
  assertNear(rgbAt(frames.get(nH1), W, L.samples.accent), hexRgb(L.colors.accent), 14, "accent rule");
  assertNear(rgbAt(frames.get(nH1), W, L.samples.panel), blend(L.colors.panel, L.colors.panelAlpha, red), 14, "panel");
  assertNear(rgbAt(frames.get(nH1), W, L.samples.transparent), red, 6, "transparent corner");
  const grey = compositeFrames(r.path, W, H, [Math.round(r0 * 30) + 6, nMid, nH1], { bg: "0x6a7f8c" });
  savePng(grey.get(Math.round(r0 * 30) + 6), W, H, "stat_roll_early_over_grey");
  savePng(grey.get(nMid), W, H, "stat_roll_mid_over_grey");
  savePng(grey.get(nH1), W, H, "stat_settled_over_grey");
  measured.stat = { timings: r.timings, bytes: r.bytes, frames: r.frames, alpha: r.alpha, rollSec: L.rollSec, valueDiff: { rolling: Number(rolling.toFixed(2)), settled: Number(settled.toFixed(2)) }, fontLog: r.fontLog };
});

t("cache hit: identical inputs return the committed card with zero lint / runtime / spawn calls", async () => {
  assert.ok(LT, "needs the lower_third render");
  const { calls, deps } = spyDeps();
  const t0 = Date.now();
  const r = await CR.renderCard({ template: "lower_third", vars: { subtitle: VARS.lower_third.subtitle, title: VARS.lower_third.title }, brand: { ...BRAND }, dur: 2.5, projectDir: PROJ, runId: "lt2", pidFile: null, deps });
  const ms = Date.now() - t0;
  assert.ok(r.ok && r.cached, JSON.stringify(r));
  assert.equal(r.cardHash, LT.cardHash);
  assert.equal(r.path, LT.path);
  assert.deepEqual(calls, { validate: 0, runtimeCheck: 0, runProcess: 0 });
  assert.ok(ms < 1500, `cache hit took ${ms} ms`);
  assert.deepEqual(r.layout, LT.layout);
  measured.cacheHitMs = ms;
});

t("an NTSTATUS launch crash is retried once under the watchdog; a plain exit or a timeout is not retried", async () => {
  assert.ok(LT, "needs a real webm to stand in for the retried render");
  const okGates = { validate: async () => ({ ok: true, parsed: true, errorCount: 0 }), runtimeCheck: async () => ({ ok: true }) };
  const seen = [];
  const flaky = async (cmd, args, opts) => {
    seen.push({ cmd, args, opts });
    if (seen.length === 1) throw new EditError("PROC_EXIT", { errorClass: "transient", retryable: true, detail: "", extra: { exitCode: 3221225794 } });
    fs.copyFileSync(LT.path, args[args.indexOf("--output") + 1]);
    return { code: 0, stdout: "[INFO] Compiled composition metadata", stderr: "", durationMs: 1 };
  };
  const r = await CR.renderCard({ template: "lower_third", vars: { ...VARS.lower_third, subtitle: "Founder & CEO" }, brand: BRAND, dur: 2.5, projectDir: PROJ, runId: "nt1", pidFile: null, deps: { ...okGates, runProcess: flaky, retryDelayMs: 10 } });
  assert.ok(r.ok, `${r.reason} ${r.detail}`);
  assert.equal(r.attempts, 2);
  assert.equal(seen.length, 2);
  const { args, opts } = seen[0];
  assert.equal(opts.timeoutMs, 120000);
  assert.equal(opts.env.HYPERFRAMES_NO_TELEMETRY, "1");
  assert.equal(opts.cwd, path.join(PROJ, "render", "cards", r.cardHash));
  for (const [flag, val] of [["--format", "webm"], ["--fps", "30"], ["--workers", "1"], ["--quality", "standard"]]) assert.equal(args[args.indexOf(flag) + 1], val, flag);
  assert.equal(args[args.length - 1], ".");
  assert.equal(args[args.indexOf("render") - 0], "render");
  const outArg = args[args.indexOf("--output") + 1];
  assert.ok(path.isAbsolute(outArg) && outArg.endsWith(`${path.sep}out.webm`) && !outArg.startsWith(PROJ), `output goes to a short work dir: ${outArg}`);
  assert.ok(!fs.existsSync(path.dirname(outArg)), "work dir removed");

  for (const [label, err] of [["exit 1", new EditError("PROC_EXIT", { detail: "boom", extra: { exitCode: 1 } })], ["timeout", new EditError("PROC_TIMEOUT", { detail: "timeout 120000ms" })]]) {
    let n = 0;
    const r2 = await CR.renderCard({ template: "lower_third", vars: { ...VARS.lower_third, subtitle: `Studio ${label}` }, brand: BRAND, dur: 2.5, projectDir: PROJ, pidFile: null, deps: { ...okGates, runProcess: async () => { n++; throw err; }, retryDelayMs: 10 } });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, "render");
    assert.equal(n, 1, `${label} is not retried`);
    assert.equal(r2.fallback.assEvents.length, 2);
  }
});

t("an alpha-less webm is rejected by verification and falls back; verifyCardWebm passes the real card", async () => {
  assert.ok(LT, "needs the lower_third render");
  const opaque = path.join(tmp.dir, "opaque.webm");
  ffRun(["-f", "lavfi", "-i", "color=c=blue:s=1080x340:r=30:d=2.5", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "300k", "-pix_fmt", "yuv420p", opaque]);
  const okGates = { validate: async () => ({ ok: true }), runtimeCheck: async () => ({ ok: true }) };
  const r = await CR.renderCard({
    template: "lower_third", vars: { ...VARS.lower_third, subtitle: "Opaque output" }, brand: BRAND, dur: 2.5, projectDir: PROJ, pidFile: null,
    deps: { ...okGates, runProcess: async (c, args) => { fs.copyFileSync(opaque, args[args.indexOf("--output") + 1]); return { code: 0, stdout: "", stderr: "" }; } },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "verify");
  assert.match(r.detail, /ALPHA_MODE/);
  assert.ok(r.fallback && r.fallback.assEvents.length === 2);
  const dir = path.join(PROJ, "render", "cards", r.cardHash);
  assert.ok(!fs.existsSync(path.join(dir, "out.webm")) && !fs.existsSync(path.join(dir, "card.json")), "nothing committed");
  assert.deepEqual(fs.readdirSync(dir).filter((n) => /out_tmp|alpha_probe/.test(n)), [], "no temp files left");
  const v = await CR.verifyCardWebm(LT.path, { w: 1080, h: 340, dur: 2.5, pidFile: null });
  assert.ok(v.ok, v.problems.join("; "));
  const wrong = await CR.verifyCardWebm(LT.path, { w: 1080, h: 360, dur: 3, pidFile: null });
  assert.ok(!wrong.ok && wrong.problems.some((p) => /size/.test(p)) && wrong.problems.some((p) => /frames|duration/.test(p)));
});

// ======================================================================================================
section("fallback — ASS events");

t("fault token 'card' returns the fallback without building, linting or spawning; events carry \\fad(120,120) and a \\t pop", async () => {
  const { calls, deps } = spyDeps();
  let built = 0;
  const tpl = { ...CR.getTemplate("keyword"), build: (...a) => { built++; return CR.getTemplate("keyword").build(...a); } };
  const r = await CR.renderCard({ template: tpl, vars: VARS.keyword, brand: BRAND, dur: 2, projectDir: PROJ, settings: { faults: { allow: true, global: "card" } }, pidFile: null, deps });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "fault");
  assert.equal(r.detail, "CARD_RENDER_FAILED");
  assert.deepEqual(calls, { validate: 0, runtimeCheck: 0, runProcess: 0 });
  assert.equal(built, 0);
  const fb = r.fallback;
  assert.equal(fb.kind, "ass");
  assert.deepEqual(fb.region, { w: 1080, h: 420 });
  assert.equal(fb.assEvents.length, 1);
  const e = fb.assEvents[0];
  assert.equal(e.text, "CONSISTENCY");
  assert.equal(e.family, "Anton");
  assert.equal(e.startSec, 0);
  assert.equal(e.endSec, 2);
  assert.ok(e.tags.includes("\\fad(120,120)") && e.tags.includes("\\t(0,240,\\fscx100\\fscy100)") && e.tags.includes("\\fscx92"), e.tags);
  assert.equal(e.colour, K.derivePalette(BRAND).accentOnDark);
  assert.deepEqual(fb.fonts, ["Anton-Regular.ttf"]);
  assert.match(fb.style.line, /^Style: Card,Anton,64,.*,0,0,0,100,100,0,0,1,3,1,5,0,0,0,-1$/);
  const d = CR.fallbackDialogues(fb, { outInSec: 1, offsetX: 0, offsetY: 900 });
  assert.equal(d.length, 1);
  assert.ok(d[0].startsWith("Dialogue: 0,0:00:01.00,0:00:03.00,Card,,0,0,0,,{\\an5\\pos(540,"), d[0]);
  assert.ok(d[0].endsWith("}CONSISTENCY"));
});

t("a template whose inline script calls Math.random is rejected by the REAL lint → fallback (no runtime check, no render); unknown and unbuildable templates fall back", async () => {
  const broken = {
    id: "broken_card", version: 1, fontRoles: { display: "DM Sans", body: "DM Sans" }, defaultDims: () => ({ w: 640, h: 360 }),
    build: (vars, brand, fonts, { w, h, dur }) => ({
      indexHtml: `<!doctype html><html><head><meta charset="utf-8"><style>html, body { margin: 0; background: transparent; }</style></head><body><div id="root" data-composition-id="vid" data-width="${w}" data-height="${h}" data-start="0" data-duration="${dur}"><div id="x" class="clip" data-start="0" data-duration="${dur}" data-track-index="0" style="opacity:0">x</div></div><script src="gsap.min.js"></script><script>window.__timelines = window.__timelines || {}; const tl = gsap.timeline({ paused: true }); tl.to("#x", { opacity: 1, x: Math.random() * 10, duration: 1 }, 0); window.__timelines["vid"] = tl;</script></body></html>`,
      metaJson: K.metaJsonFor({ w, h, dur }),
      extraFiles: [K.gsapExtraFile()],
    }),
  };
  const { calls, deps } = spyDeps();
  const r = await CR.renderCard({ template: broken, vars: { title: "Hello" }, brand: BRAND, dur: 2, projectDir: PROJ, pidFile: null, deps });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "lint");
  assert.match(r.detail, /non_deterministic_code/);
  assert.deepEqual(calls, { validate: 1, runtimeCheck: 0, runProcess: 0 });
  assert.deepEqual(r.fallback.assEvents.map((e) => e.text), ["Hello"]);

  const u = await CR.renderCard({ template: "nope", vars: { title: "Big news", subtitle: "today" }, brand: BRAND, projectDir: PROJ, pidFile: null });
  assert.equal(u.reason, "unknown_template");
  assert.deepEqual(u.fallback.assEvents.map((e) => e.text), ["Big news", "today"]);
  const b = await CR.renderCard({ template: "lower_third", vars: { subtitle: "no title" }, brand: BRAND, projectDir: PROJ, pidFile: null, deps: spyDeps().deps });
  assert.equal(b.reason, "build_failed");
  assert.deepEqual(b.fallback.assEvents.map((e) => e.text), ["no title"]);
});

t("fallback events burn with libass: only bundled fonts are selected, text is drawn inside [outIn, outIn + dur) and nowhere else", () => {
  const cases = [
    { template: "lower_third", vars: VARS.lower_third, lang: "en" },
    { template: "hook_title", vars: { title: "वीडियो एडिटिंग का तेज़ तरीका", subtitle: "तीन आदतें KEYFRAME" }, lang: "hi" },
  ];
  measured.fallbackInk = {};
  for (const c of cases) {
    const fb = CR.fallbackForCard({ ...c, brand: BRAND, dur: 2.5 });
    const H0 = 1300;
    const assText = CR.fallbackAssText(fb, { output: { w: 1080, h: 1920 }, outInSec: 1.0, offsetX: 0, offsetY: H0 });
    assert.ok(assText.includes("YCbCr Matrix: TV.709") && assText.includes(",-1\n"), "TV.709 + Encoding -1");
    A.copyFontsForAss(PROJ, fb.fonts);
    const rel = `render/cache/ass/fallback_${c.template}_${c.lang}.ass`;
    A.writeAssFile(PROJ, rel, assText);
    const fcs = path.join(PROJ, "render", "cache", "ass", `burn_${c.template}.fcs`);
    fs.writeFileSync(fcs, `[0:v]format=yuv420p,${A.burnInArgs({ assRelPath: rel })},select='eq(n\\,15)+eq(n\\,60)+eq(n\\,112)',format=rgb24[o]\n`);
    const r = ffRun(["-f", "lavfi", "-i", "color=c=0x404040:s=1080x1920:r=30:d=4", "-/filter_complex", path.relative(PROJ, fcs).split(path.sep).join("/"), "-map", "[o]", "-fps_mode", "passthrough", "-f", "rawvideo", "-"], { cwd: PROJ, verbose: true });
    const size = 1080 * 1920 * 3;
    assert.equal(r.stdout.length, size * 3);
    const frame = (i) => r.stdout.subarray(i * size, (i + 1) * size);
    const grey = Array.from(frame(0).subarray(0, 3));
    const region = { x: 0, y: H0, w: 1080, h: fb.region.h };
    assert.equal(countUnlike(frame(0), 1080, 1920, grey, 6), 0, `${c.template}: nothing drawn before outIn`);
    const ink = countUnlike(frame(1), 1080, 1920, grey, 30, region);
    assert.ok(ink > 3000, `${c.template}: text drawn in the card region (${ink} px)`);
    assert.equal(countUnlike(frame(1), 1080, 1920, grey, 30, { x: 0, y: 0, w: 1080, h: H0 - 40 }), 0, `${c.template}: nothing drawn above the region`);
    assert.equal(countUnlike(frame(2), 1080, 1920, grey, 6), 0, `${c.template}: nothing drawn after outIn + dur`);
    const qa = fontname.checkFontselect(String(r.stderr), { families: fb.families });
    assert.ok(qa.ok, `${c.template}: ${qa.problems.join("; ")}`);
    savePng(frame(1), 1080, 1920, `fallback_${c.template}_${c.lang}`);
    measured.fallbackInk[`${c.template}/${c.lang}`] = { ink, families: fb.families };
  }
});

t("cancellation is not a card failure: an aborted signal rejects with PROC_ABORTED before or during the render", async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(CR.renderCard({ template: "keyword", vars: VARS.keyword, brand: BRAND, projectDir: PROJ, signal: ac.signal, pidFile: null }), (e) => e.code === "PROC_ABORTED");
  const okGates = { validate: async () => ({ ok: true }), runtimeCheck: async () => ({ ok: true }) };
  await assert.rejects(CR.renderCard({
    template: "keyword", vars: { title: "Cancelled" }, brand: BRAND, projectDir: PROJ, pidFile: null,
    deps: { ...okGates, runProcess: async () => { throw new EditError("PROC_ABORTED", { errorClass: "cancelled", detail: "aborted" }); } },
  }), (e) => e.code === "PROC_ABORTED");
});

// ======================================================================================================
run().then(({ failed }) => {
  restoreFetch();
  console.log("measured:", JSON.stringify(measured, null, 2));
  if (KEEP) console.log(`review PNGs in ${REVIEW}`);
  if (!KEEP && !failed) tmp.cleanup();
  else console.log(`temp kept: ${tmp.dir}`);
  process.exitCode = failed ? 1 : 0;
});
