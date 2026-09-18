// Tests for video_edit/captions/{fontname,ass}.js — golden ASS structure plus REAL libass burn-ins.
// Run: node scripts/video_edit_ass.test.cjs        (VE_ASS_KEEP=<dir> keeps review PNGs there)
//
// Load-bearing:
//   * every Style: Encoding -1, Fontname = manifest name-ID-1 family, Bold from the manifest weight, TV.709,
//     PlayRes = output size, WrapStyle 2 — and libass's own `fontselect:` log resolves every family to the
//     bundled file with no missing glyph (Latin runs inside hi/ar cues go to a bundled Latin face);
//   * per-word highlight never reflows: ink-mask XOR between the frames either side of every word change is
//     ≤ 0.2 % with an identical bbox (bold_pop, karaoke_blob), and the highlight moves on exactly that frame;
//   * Arabic highlight keeps RTL order and joining (and an Encoding 1 control proves the check can fail);
//   * the brand highlight decodes as BT.709 within ΔE2000 ≤ 2.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const proc = require("../src/video_edit/engine/proc");
const fontname = require("../src/video_edit/captions/fontname");
const A = require("../src/video_edit/captions/ass");
const { resolveStyle, STYLE_IDS } = require("../src/video_edit/captions/styles");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-ass-");
const PROJ = path.join(tmp.dir, "proj");
fs.mkdirSync(path.join(PROJ, "render"), { recursive: true });
const KEEP = process.env.VE_ASS_KEEP ? path.resolve(process.env.VE_ASS_KEEP) : null;
if (KEEP) fs.mkdirSync(KEEP, { recursive: true });

const BS = "\\";
const OUT = { width: 1080, height: 1920 };
const BRAND = { primary: "#1d3557", accent: "#E832A8", text: "#ffffff", onAccent: "#ffffff", source: "user" };
const style = (id, lang = "en", output = OUT) => resolveStyle(id, { brand: BRAND, lang, aspect: output.width > output.height ? "16:9" : "9:16", output });

// ---- fixtures ---------------------------------------------------------------------------------
function mkCue(id, words, { lines = null, t0 = 0, starts = null, end = null, emph = [], prop = false, pos = { x: 0.5, y: 0.72, an: 2 }, hidden = false } = {}) {
  const st = starts ? starts.map((s) => t0 + s) : words.map((_, k) => t0 + k * 0.4);
  const outOut = end != null ? t0 + end : st[st.length - 1] + 0.4;
  const ws = words.map((text, k) => {
    const e = k + 1 < st.length ? st[k + 1] : outOut;
    return { key: `w${k}`, i: k, text, srcStart: st[k], srcEnd: e, outStart: st[k], outEnd: e, emphasis: emph.includes(k), conf: 1 };
  });
  const L = lines || [words.join(" ")];
  return {
    id, anchor: { kind: "words", w0: 0, w1: words.length - 1 }, resolved: { outIn: t0, outOut, collapsed: false },
    text: L.join(" "), lines: L, words: ws, timingMode: prop ? "proportional" : "words", pos, hidden, edited: false,
  };
}

function parseAss(text) {
  const info = {}, styles = [], events = [];
  let sec = null, sf = null, ef = null;
  for (const l of text.split("\n")) {
    if (/^\[.+\]$/.test(l)) { sec = l; continue; }
    if (sec === "[Script Info]") { const m = /^([^:;]+):\s*(.*)$/.exec(l); if (m) info[m[1]] = m[2]; }
    else if (sec === "[V4+ Styles]") {
      if (l.startsWith("Format:")) sf = l.slice(7).split(",").map((s) => s.trim());
      else if (l.startsWith("Style:")) { const v = l.slice(6).trim().split(","); styles.push(Object.fromEntries(sf.map((k, i) => [k, v[i]]))); }
    } else if (sec === "[Events]") {
      if (l.startsWith("Format:")) ef = l.slice(7).split(",").map((s) => s.trim());
      else if (l.startsWith("Dialogue:")) {
        let rest = l.slice(9).trim();
        const parts = [];
        for (let i = 0; i < ef.length - 1; i++) { const j = rest.indexOf(","); parts.push(rest.slice(0, j)); rest = rest.slice(j + 1); }
        parts.push(rest);
        events.push(Object.fromEntries(ef.map((k, i) => [k, parts[i]])));
      }
    }
  }
  return { info, styles, events };
}

// What libass would print, override blocks removed (\{ \} are literal braces).
function stripOverrides(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === BS && (s[i + 1] === "{" || s[i + 1] === "}")) { out += s[i + 1]; i++; continue; }
    if (s[i] === "{") { const j = s.indexOf("}", i); if (j < 0) { out += s.slice(i); break; } i = j; continue; }
    out += s[i];
  }
  return out;
}
const csOfTime = (ts) => { const m = /^(\d+):(\d\d):(\d\d)\.(\d\d)$/.exec(ts); return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 100 + +m[4]; };
const posTag = (text) => (/^\{(\\an\d\\pos\(\d+,\d+\))/.exec(text) || [])[1];

// ---- image helpers (rgb24 buffers) -----------------------------------------------------------
const rgbOf = (hex) => { const h = hex.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
function mask(px, w, h, pred) {
  const m = new Uint8Array(w * h);
  let ink = 0;
  for (let i = 0, o = 0; i < w * h; i++, o += 3) if (pred(px[o], px[o + 1], px[o + 2])) { m[i] = 1; ink++; }
  return { m, ink, w, h, bbox: bboxOf(m, w, h) };
}
function bboxOf(m, w, h) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
const offGreen = (r, g, b) => Math.max(r, 255 - g, b) > 60;
const nearHex = (hex, d) => { const [R, G, B] = rgbOf(hex); return (r, g, b) => Math.max(Math.abs(r - R), Math.abs(g - G), Math.abs(b - B)) <= d; };
function dilate(m, w, h, rad) {
  const tmpM = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    for (let dx = Math.max(0, x - rad); dx <= Math.min(w - 1, x + rad); dx++) tmpM[y * w + dx] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!tmpM[y * w + x]) continue;
    for (let dy = Math.max(0, y - rad); dy <= Math.min(h - 1, y + rad); dy++) out[dy * w + x] = 1;
  }
  return out;
}
function erodeCount(m, w, h, rad, px) {
  let n = 0; const sum = [0, 0, 0];
  for (let y = rad; y < h - rad; y++) for (let x = rad; x < w - rad; x++) {
    let all = true;
    for (let dy = -rad; dy <= rad && all; dy++) for (let dx = -rad; dx <= rad; dx++) if (!m[(y + dy) * w + x + dx]) { all = false; break; }
    if (!all) continue;
    const o = (y * w + x) * 3; n++; sum[0] += px[o]; sum[1] += px[o + 1]; sum[2] += px[o + 2];
  }
  return { n, mean: sum.map((s) => (n ? s / n : 0)) };
}
function xorStats(a, b, exclude = null) {
  let xor = 0, inkA = 0;
  const ma = new Uint8Array(a.w * a.h), mb = new Uint8Array(a.w * a.h);
  for (let i = 0; i < a.m.length; i++) {
    if (exclude && exclude[i]) continue;
    ma[i] = a.m[i]; mb[i] = b.m[i];
    inkA += a.m[i];
    if (a.m[i] !== b.m[i]) xor++;
  }
  return { xor, inkA, frac: inkA ? xor / inkA : 1, bboxA: bboxOf(ma, a.w, a.h), bboxB: bboxOf(mb, a.w, a.h) };
}
function lab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047, Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B, Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (v) => (v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function deltaE2000(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2), rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hh = (a, b) => { if (a === 0 && b === 0) return 0; const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; };
  const h1p = hh(a1p, b1), h2p = hh(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0; if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p; if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hpm += h1p + h2p < 360 ? 360 : -360; hpm /= 2; }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// ---- ffmpeg burn (cwd = project dir, relative paths, graph in a -/filter_complex script) ------
let burnSeq = 0;
async function burn(name, { asses, dur, bg = "0x00FF00", select, crop, verbose = false, png = false }) {
  const rels = asses.map((a) => {
    const rel = `render/cache/ass/${name}_${burnSeq++}_${a.r.assHash.slice(0, 10)}.ass`;
    A.writeAssFile(PROJ, rel, a.text || a.r.text);
    A.copyFontsForAss(PROJ, a.r.fonts);
    return rel;
  });
  const chain = rels.map((rel) => A.burnInArgs({ assRelPath: rel, fontsDirRel: "fonts" })).join(",");
  const sel = `select='${select.map((n) => `eq(n${BS},${n})`).join("+")}'`;
  const base = `[0:v]format=rgb24,${chain},${sel},crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`;
  fs.writeFileSync(path.join(PROJ, "render", `${name}.fcs`), png ? `${base},split=2[v][p]` : `${base}[v]`);
  const args = ["-y", "-loglevel", verbose ? "verbose" : "error", "-nostats",
    "-protocol_whitelist", "file", "-f", "lavfi", "-i", `color=c=${bg}:s=${OUT.width}x${OUT.height}:r=30:d=${dur}`,
    "-/filter_complex", `render/${name}.fcs`,
    "-map", "[v]", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", `render/${name}.rgb`];
  if (png) {
    const pngDir = KEEP || path.join(PROJ, "render");
    args.push("-map", "[p]", "-fps_mode", "passthrough", "-f", "image2", path.join(pngDir, `${name}_%02d.png`));
  }
  const r = await proc.ffmpeg(args, { cwd: PROJ, timeoutMs: 180000, pidFile: null, label: "ass-test" });
  const buf = fs.readFileSync(path.join(PROJ, "render", `${name}.rgb`));
  const size = crop.w * crop.h * 3;
  assert.equal(buf.length, size * select.length, `${name}: expected ${select.length} frames, got ${buf.length / size}`);
  const frames = select.map((_, i) => buf.subarray(i * size, (i + 1) * size));
  return { frames, stderr: r.stderr, durationMs: r.durationMs, at: (n) => frames[select.indexOf(n)] };
}

// ================================================================================================
section("fontname — manifest vs the real name tables");

t("manifest family / weight / scripts / sha256 match every bundled TTF (static TrueType, name ID 1)", async () => {
  const crypto = require("node:crypto");
  const list = fontname.readManifest();
  assert.equal(list.length, 8);
  for (const e of list) {
    const abs = path.join(fontname.FONTS_DIR_ABS, e.file);
    const f = fontname.readFont(abs);
    assert.equal(f.flavour, "truetype", e.file);
    assert.equal(f.variable, false, e.file);
    assert.equal(f.family, e.family, `${e.file} name ID 1`);
    assert.ok(f.libassFamilies.includes(e.family), `${e.file} Windows family records`);
    assert.equal(f.weight, e.weight, `${e.file} usWeightClass`);
    assert.deepEqual(f.scripts, [...e.scripts], `${e.file} cmap scripts`);
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex"), e.sha256, `${e.file} sha256`);
    assert.equal(f.bytes, e.bytes);
  }
});

t("script faces, Latin fallback, Bold flag and glyph coverage facts from F0", () => {
  assert.equal(fontname.fontForScript("hi").family, "Noto Sans Devanagari");
  assert.equal(fontname.fontForScript("ar").family, "Noto Sans Arabic");
  assert.equal(fontname.fontForScript("ja").family, "Noto Sans JP");
  assert.equal(fontname.fontForScript("es"), null);
  assert.equal(fontname.latinFallbackFamily("bold_pop"), "Archivo Black");
  assert.equal(fontname.latinFallbackFamily("Noto Sans Arabic"), "DM Sans");
  assert.equal(fontname.assBoldFor("Archivo Black"), 0);
  assert.equal(fontname.assBoldFor("Anton"), 0);
  for (const f of ["DM Sans", "Figtree", "Barlow Condensed", "Noto Sans Devanagari", "Noto Sans Arabic", "Noto Sans JP"]) assert.equal(fontname.assBoldFor(f), -1, f);
  assert.equal(fontname.hasGlyph("Noto Sans Devanagari", 0x41), false);
  assert.equal(fontname.hasGlyph("Noto Sans Devanagari", 0x34), true);
  assert.equal(fontname.hasGlyph("Noto Sans Arabic", 0x3f), false);
  assert.equal(fontname.hasGlyph("Noto Sans JP", 0x41), true);
});

t("checkFontselect flags a system-font fallback, a missing glyph and an unselected family", () => {
  const log = [
    "[Parsed_ass_0 @ 1] fontselect: (Archivo Black, 400, 0) -> ArchivoBlack-Regular, 0, ArchivoBlack-Regular",
    "[Parsed_ass_0 @ 1] Glyph 0x4F not found, selecting one more font for (Noto Sans Devanagari, 700, 0)",
    "[Parsed_ass_0 @ 1] fontselect: (Noto Sans Devanagari, 700, 0) -> Arial-BoldMT, 0, Arial-BoldMT",
  ].join("\n");
  const r = fontname.checkFontselect(log, { families: ["Archivo Black", "Figtree"] });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 3, r.problems.join(" | "));
  assert.equal(fontname.checkFontselect(log.split("\n")[0], { families: ["Archivo Black"] }).ok, true);
});

// ================================================================================================
section("ass — golden structure");

const WORDS4 = ["Watch", "this", "quick", "tip"];
const WORDS6 = ["The", "blob", "moves", "with", "every", "word"];
const LINES6 = ["The blob moves", "with every word"];

function build(id, cues, opts = {}) {
  const st = opts.style || style(id, opts.lang || "en", opts.output || OUT);
  return A.buildAss({ cues, style: st, output: opts.output || OUT, lang: opts.lang || "en", highlight: opts.highlight });
}

t("every style: header fields, one Style with Encoding -1, name-ID-1 Fontname, manifest Bold, BorderStyle", () => {
  for (const id of STYLE_IDS) {
    const r = build(id, [mkCue("c_0", WORDS6, { lines: LINES6 })]);
    const p = parseAss(r.text);
    assert.equal(p.info.ScriptType, "v4.00+", id);
    assert.equal(p.info.PlayResX, "1080", id);
    assert.equal(p.info.PlayResY, "1920", id);
    assert.equal(p.info.WrapStyle, "2", id);
    assert.equal(p.info.ScaledBorderAndShadow, "yes", id);
    assert.equal(p.info["YCbCr Matrix"], "TV.709", id);
    assert.equal(p.styles.length, 1, id);
    const s = p.styles[0];
    const st = style(id);
    const entry = fontname.entryForFamily(st.font.family);
    assert.equal(s.Encoding, "-1", `${id} Encoding`);
    assert.equal(s.Fontname, entry.family, `${id} Fontname`);
    assert.equal(s.Bold, entry.weight >= 700 ? "-1" : "0", `${id} Bold`);
    assert.equal(s.Fontsize, String(st.font.sizePx), `${id} size`);
    assert.equal(s.PrimaryColour, "&H00FFFFFF", id);
    assert.equal(s.BorderStyle, st.box.enabled ? "3" : "1", `${id} BorderStyle`);
    assert.deepEqual(r.fonts, [entry.file], id);
    assert.equal(r.missingGlyphs.length, 0, id);
    for (const e of p.events) assert.equal(e.Style, A.STYLE_NAME);
  }
  const pb = parseAss(build("bold_pop", []).text);
  assert.equal(pb.styles[0].Bold, "0", "Archivo Black is 400: Bold 0");
  assert.equal(parseAss(build("single_word", []).text).styles[0].Bold, "0", "Anton is 400: Bold 0");
});

t("event counts per cue: highlight styles one event per word (blob two layers), plain styles one, single_word one per word, sweep one with \\kf per word", () => {
  const cue = () => mkCue("c_0", WORDS6, { lines: LINES6 });
  const count = (id, hl) => parseAss(build(id, [cue()], { highlight: hl }).text).events;
  assert.equal(count("bold_pop").length, 6);
  assert.equal(count("brand_bar").length, 6);
  const blob = count("karaoke_blob");
  assert.equal(blob.length, 12);
  assert.equal(blob.filter((e) => e.Layer === "0").length, 6);
  assert.equal(blob.filter((e) => e.Layer === "1").length, 6);
  assert.equal(count("clean").length, 1);
  assert.equal(count("minimal_lower").length, 1);
  assert.equal(count("single_word").length, 6);
  const sweep = count("bold_pop", "sweep");
  assert.equal(sweep.length, 1);
  const kfs = [...sweep[0].Text.matchAll(/\\kf(\d+)/g)].map((m) => Number(m[1]));
  assert.equal(kfs.length, 6);
  assert.equal(kfs.reduce((a, b) => a + b, 0), csOfTime(sweep[0].End) - csOfTime(sweep[0].Start), "\\kf durations fill the cue");
  const two = parseAss(build("bold_pop", [cue(), mkCue("c_9", WORDS4, { t0: 3 })]).text).events;
  assert.equal(two.length, 10, "counts add up across cues");
});

t("per-word events: identical \\an2\\pos and full text, only the active word's colour moves, pop on the first event only", () => {
  const st = style("bold_pop");
  const r = build("bold_pop", [mkCue("c_0", WORDS4, { starts: [0, 0.4, 0.8, 1.3], end: 1.9 })]);
  const ev = parseAss(r.text).events;
  assert.equal(ev.length, 4);
  const hl = `&H${st.colors.highlight.slice(5, 7)}${st.colors.highlight.slice(3, 5)}${st.colors.highlight.slice(1, 3)}&`.toUpperCase();
  const tags = new Set(ev.map((e) => posTag(e.Text)));
  assert.deepEqual([...tags], ["\\an2\\pos(540,1382)"]);
  assert.equal(new Set(ev.map((e) => stripOverrides(e.Text))).size, 1, "same visible text in every event");
  assert.equal(stripOverrides(ev[0].Text), "WATCH THIS QUICK TIP");
  ev.forEach((e, k) => {
    const m = new RegExp(`\\{\\\\c${hl.replace(/&/g, "&")}\\}([^{]+)\\{\\\\c&HFFFFFF&\\}`).exec(e.Text);
    assert.ok(m, `event ${k} has a highlighted word: ${e.Text}`);
    assert.equal(m[1], WORDS4[k].toUpperCase());
  });
  assert.match(ev[0].Text, /^\{\\an2\\pos\(540,1382\)\\fscx85\\fscy85\\t\(0,120,\\fscx100\\fscy100\)\}/);
  for (const e of ev.slice(1)) assert.ok(!e.Text.includes("\\t("), `no pop after the first event: ${e.Text}`);
  // Frame-exact boundaries: 0.4 s = frame 12 -> 0:00:00.40; 1.3 s = frame 39 -> 1.30.
  assert.deepEqual(ev.map((e) => [e.Start, e.End]), [["0:00:00.00", "0:00:00.40"], ["0:00:00.40", "0:00:00.80"], ["0:00:00.80", "0:00:01.30"], ["0:00:01.30", "0:00:01.90"]]);
});

t("emphasis scale is identical in every event of a cue and animates with the pop in the first", () => {
  const ev = parseAss(build("bold_pop", [mkCue("c_0", WORDS4, { emph: [2] })]).text).events;
  assert.match(ev[0].Text, /\{\\fscx95\.2\\fscy95\.2\\t\(0,120,\\fscx112\\fscy112\)\}QUICK\{\\fscx85\\fscy85\\t\(0,120,\\fscx100\\fscy100\)\}/);
  for (const e of ev.slice(1)) {
    assert.equal((e.Text.match(/\\fscx112\\fscy112/g) || []).length, 1, e.Text);
    assert.ok(/\{\\fscx112\\fscy112\}(\{\\c&H[0-9A-F]{6}&\})?QUICK/.test(e.Text), e.Text);
  }
});

t("blob: layer 1 hides everything, shows only the active word with brand border, and restores alpha right after it", () => {
  const st = style("karaoke_blob");
  const hl = `&H${st.colors.highlight.slice(5, 7)}${st.colors.highlight.slice(3, 5)}${st.colors.highlight.slice(1, 3)}&`.toUpperCase();
  const ev = parseAss(build("karaoke_blob", [mkCue("c_0", WORDS6, { lines: LINES6 })]).text).events;
  const top = ev.filter((e) => e.Layer === "1");
  const base = ev.filter((e) => e.Layer === "0");
  top.forEach((e, k) => {
    assert.match(e.Text, /^\{\\an2\\pos\(540,1382\)(\\fad\(80,0\))?\\shad0\\alpha&HFF&\}/, e.Text);
    const re = new RegExp(`\\{\\\\alpha&H00&\\\\3c${hl}\\\\bord14\\\\blur2\\}([^{]+)\\{\\\\alpha&HFF&\\}`, "g");
    const hits = [...e.Text.matchAll(re)];
    assert.equal(hits.length, 1, `exactly one visible word in layer 1 event ${k}: ${e.Text}`);
    assert.equal(hits[0][1], WORDS6[k]);
    assert.equal((e.Text.match(/\\alpha&H00&/g) || []).length, 1);
    assert.equal(stripOverrides(e.Text), stripOverrides(base[k].Text), "blob layer repeats the text exactly");
    assert.equal(e.Start, base[k].Start); assert.equal(e.End, base[k].End);
  });
  assert.equal(stripOverrides(base[0].Text), `The blob moves${BS}Nwith every word`);
  const small = parseAss(build("karaoke_blob", [mkCue("c_0", WORDS6, { lines: LINES6 })], { output: { width: 540, height: 960 } }).text).events;
  assert.ok(small[1].Text.includes("\\bord7\\blur1}"), `blob border scales with output: ${small[1].Text}`);
});

t("brand_bar underlines and colours the active word; single_word centres each word at \\an5 with pop and emphasis colour", () => {
  const bb = parseAss(build("brand_bar", [mkCue("c_0", WORDS6, { lines: LINES6 })]).text).events;
  bb.forEach((e, k) => assert.ok(new RegExp(`\\{\\\\u1\\\\c&H[0-9A-F]{6}&\\}${WORDS6[k]}\\{\\\\u0\\\\c&HFFFFFF&\\}`).test(e.Text), e.Text));
  const sw = parseAss(build("single_word", [mkCue("c_0", ["Big", "word"], { emph: [1] })]).text).events;
  assert.equal(sw.length, 2);
  assert.match(sw[0].Text, /^\{\\an5\\pos\(540,\d+\)\\fscx70\\fscy70\\t\(0,90,\\fscx100\\fscy100\)\}BIG$/);
  assert.match(sw[1].Text, /^\{\\an5\\pos\(540,\d+\)\\fscx80\.5\\fscy80\.5\\t\(0,90,\\fscx115\\fscy115\)\\c&H[0-9A-F]{6}&\}WORD$/);
});

t("proportional cues: one event, entry animation, no highlight; hidden / collapsed / zero-length cues are skipped", () => {
  const st = style("bold_pop");
  const hlTag = `\\c&H${st.colors.highlight.slice(5, 7)}${st.colors.highlight.slice(3, 5)}${st.colors.highlight.slice(1, 3)}&`.toUpperCase();
  const prop = mkCue("c_0", WORDS4, { prop: true });
  const hidden = mkCue("c_1", WORDS4, { t0: 2, hidden: true });
  const collapsed = { ...mkCue("c_2", WORDS4, { t0: 4 }), resolved: { outIn: 4, outOut: 5, collapsed: true } };
  const zero = { ...mkCue("c_3", WORDS4, { t0: 6 }), resolved: { outIn: 6, outOut: 6.01, collapsed: false } };
  const r = build("bold_pop", [prop, hidden, collapsed, zero]);
  const ev = parseAss(r.text).events;
  assert.equal(ev.length, 1);
  assert.equal(r.cueCount, 1);
  assert.ok(ev[0].Text.includes("\\t(0,120,"), "pop entry kept");
  assert.ok(!ev[0].Text.toUpperCase().includes(hlTag.toUpperCase()), `no highlight: ${ev[0].Text}`);
  const fade = parseAss(build("karaoke_blob", [mkCue("c_0", WORDS6, { lines: LINES6, prop: true })]).text).events;
  assert.equal(fade.length, 1);
  assert.ok(fade[0].Text.startsWith("{\\an2\\pos(540,1382)\\fad(80,0)}"));
});

t("escaping: { } become \\{ \\}, a backslash gets a U+2060 guard (never \\\\), newlines become \\N, edge spaces \\h", () => {
  assert.equal(A.escapeAssText("a{b}c"), `a${BS}{b${BS}}c`);
  assert.equal(A.escapeAssText("x\\Ny"), `x${BS}\u2060Ny`);
  assert.equal(A.escapeAssText("tab\there\r\nnext"), `tab here${BS}Nnext`);
  const cue = mkCue("c_0", ["{\\fs200}", "x\\Ny", "two\nlines"], { lines: ["{\\fs200} x\\Ny two\nlines"] });
  cue.words[0].text = " {\\fs200}";
  const ev = parseAss(build("clean", [cue]).text).events;
  assert.equal(ev.length, 1);
  const body = ev[0].Text.replace(/^\{[^}]*\}/, "");
  assert.equal(body, `${BS}h${BS}{${BS}\u2060fs200${BS}} x${BS}\u2060Ny two${BS}Nlines`);
  assert.ok(!/\\fs200(?!\u2060)/.test(body.replace(`${BS}\u2060fs200`, "")), "no live \\fs tag");
});

t("hi/ar cues wrap Latin runs in {\\fn<style Latin face>} (with \\b when weights differ); marks and ZWJ stay in the script run", () => {
  const hi = build("bold_pop", [mkCue("c_0", ["नमस्ते", "OK!", "दुनिया"])], { lang: "hi" });
  const hev = parseAss(hi.text).events;
  assert.equal(hev.length, 3);
  for (const e of hev) assert.ok(e.Text.includes("{\\fnArchivo Black\\b0}OK{\\fnNoto Sans Devanagari\\b1}!"), e.Text);
  assert.deepEqual(hi.fonts, ["NotoSansDevanagari-Bold.ttf", "ArchivoBlack-Regular.ttf"]);
  assert.equal(parseAss(hi.text).styles[0].Fontname, "Noto Sans Devanagari");

  const clean = build("clean", [mkCue("c_0", ["नमस्ते", "OK", "क्\u200Dष"])], { lang: "hi" });
  const cev = parseAss(clean.text).events[0].Text;
  assert.ok(cev.includes("{\\fnDM Sans}OK{\\fnNoto Sans Devanagari}"), `same weight: no \\b switch: ${cev}`);
  assert.ok(cev.endsWith("क्\u200Dष"), "ZWJ conjunct not split into a Latin run");

  const ar = build("bold_pop", [mkCue("c_0", ["مرحبا", "بالعالم", "OK?", "اختبار"])], { lang: "ar" });
  const aev = parseAss(ar.text).events;
  for (const e of aev) assert.ok(e.Text.includes("{\\fnArchivo Black\\b0}OK?{\\fnNoto Sans Arabic\\b1}"), e.Text);
  assert.deepEqual(ar.fonts, ["NotoSansArabic-Bold.ttf", "ArchivoBlack-Regular.ttf"]);

  const ja = build("brand_bar", [mkCue("c_0", ["こんにちは", "OK"], { lines: ["こんにちはOK"] })], { lang: "ja" });
  assert.deepEqual(ja.fonts, ["NotoSansJP-Bold.ttf"], "Noto Sans JP covers Latin: no switch");
  assert.equal(stripOverrides(parseAss(ja.text).events[0].Text), "こんにちはOK", "ja joiner is empty");

  const emoji = build("bold_pop", [mkCue("c_0", ["Hi", "\u{1F600}"])]);
  assert.deepEqual(emoji.missingGlyphs, ["1F600"]);
});

t("assTime is frame-exact at 30 fps for 3 hours of frames; buildAss is deterministic", () => {
  for (let f = 1; f <= 324000; f++) {
    const cs = csOfTime(A.assTime(f));
    const ms = Math.round((f * 1000) / 30), prevMs = Math.round(((f - 1) * 1000) / 30);
    if (!(cs * 10 <= ms && cs * 10 > prevMs)) assert.fail(`frame ${f}: ${A.assTime(f)} (${ms} ms, prev ${prevMs} ms)`);
  }
  const cues = [mkCue("c_0", WORDS6, { lines: LINES6 }), mkCue("c_7", WORDS4, { t0: 3, emph: [1] })];
  assert.equal(build("karaoke_blob", cues).assHash, build("karaoke_blob", JSON.parse(JSON.stringify(cues))).assHash);
});

t("burnInArgs builds the relative ass filter and rejects unsafe paths; copyFontsForAss copies only manifest fonts, idempotently", () => {
  assert.equal(A.burnInArgs({ assRelPath: "render/cache/ass/abc.ass" }), "ass=f=render/cache/ass/abc.ass:fontsdir=fonts:shaping=complex");
  assert.equal(A.assRelPathFor("0123456789abcdef"), "render/cache/ass/0123456789abcdef.ass");
  for (const bad of ["../x.ass", "C:/x.ass", "/abs.ass", "a b.ass", "x:y.ass", "a/'b.ass", "render//x.ass"]) {
    assert.throws(() => A.burnInArgs({ assRelPath: bad }), (e) => e.code === "PATH_ESCAPE", bad);
  }
  const dir = path.join(tmp.dir, "fontcopy");
  fs.mkdirSync(dir);
  const first = A.copyFontsForAss(dir, ["Figtree-Bold.ttf", "NotoSansArabic-Bold.ttf"]);
  assert.deepEqual(first.copied, ["Figtree-Bold.ttf", "NotoSansArabic-Bold.ttf"]);
  assert.deepEqual(fs.readdirSync(path.join(dir, "fonts")).sort(), ["Figtree-Bold.ttf", "NotoSansArabic-Bold.ttf"]);
  assert.deepEqual(A.copyFontsForAss(dir, ["Figtree-Bold.ttf"]).copied, []);
  assert.throws(() => A.copyFontsForAss(dir, ["arial.ttf"]), (e) => e.code === "ASS_INVALID_INPUT");
});

// ================================================================================================
section("ass — real libass burn-in (1080x1920, fontsdir=fonts copies)");

t("fontselect: every family of every style and of hi / ar / ja cues resolves to its bundled file, no missing glyph", async () => {
  const variants = [
    ["bold_pop", "en", mkCue("c_0", WORDS4, { emph: [2] })],
    ["clean", "en", mkCue("c_0", ["Clean", "captions", "read", "well", "on", "every", "screen"], { lines: ["Clean captions read well", "on every screen"] })],
    ["karaoke_blob", "en", mkCue("c_0", WORDS6, { lines: LINES6 })],
    ["single_word", "en", mkCue("c_0", ["Big", "word"], { starts: [0, 0.45], end: 0.9, emph: [1] })],
    ["minimal_lower", "en", mkCue("c_0", ["A", "quiet", "lower", "caption", "with", "a", "box"], { lines: ["A quiet lower caption", "with a box"] })],
    ["brand_bar", "en", mkCue("c_0", WORDS6, { lines: LINES6 })],
    ["bold_pop", "hi", mkCue("c_0", ["नमस्ते", "OK!", "दुनिया", "परीक्षण"], { lines: ["नमस्ते OK! दुनिया परीक्षण"] })],
    ["karaoke_blob", "ar", mkCue("c_0", ["مرحبا", "بالعالم", "OK?", "اختبار"])],
    ["brand_bar", "ja", mkCue("c_0", ["こんにちは", "世界、", "テスト", "OK"], { lines: ["こんにちは世界、テストOK"] })],
  ];
  const asses = variants.map(([id, lang, cue], i) => {
    const shifted = JSON.parse(JSON.stringify(cue));
    shifted.resolved.outIn += i; shifted.resolved.outOut = Math.min(shifted.resolved.outOut, 0.95) + i;
    shifted.words.forEach((w) => { w.outStart += i; w.outEnd += i; });
    return { r: A.buildAss({ cues: [shifted], style: style(id, lang), output: OUT, lang }), id, lang };
  });
  const select = variants.map((_, i) => i * 30 + 25);
  const b = await burn("fontselect", { asses, dur: variants.length, select, crop: { x: 0, y: 1150, w: 1080, h: 320 }, verbose: true, png: true, bg: "0x3A5A40" });
  assert.ok(b.stderr.length < 60000, `stderr tail not truncated (${b.stderr.length} bytes)`);
  const byInstance = new Map();
  for (const line of b.stderr.split(/\r?\n/)) {
    const m = /Parsed_ass_(\d+)/.exec(line);
    if (!m) continue;
    const k = Number(m[1]);
    byInstance.set(k, `${byInstance.get(k) || ""}${line}\n`);
  }
  // ffmpeg numbers filters by position in the whole graph (format is 0), so map instances in order.
  const order = [...byInstance.keys()].sort((x, y) => x - y);
  assert.equal(order.length, asses.length, `one libass instance per ASS (${order.join(",")})`);
  asses.forEach((a, i) => {
    const chk = fontname.checkFontselect(byInstance.get(order[i]) || "", { families: a.r.families });
    console.log(`       ${a.id}/${a.lang}: ${chk.selections.map((s) => `${s.family} ${s.weight} -> ${s.psName}`).join("; ")}`);
    assert.ok(chk.ok, `${a.id}/${a.lang}: ${chk.problems.join(" | ")}`);
  });
  asses.forEach((a, i) => {
    const ink = mask(b.frames[i], 1080, 320, (r, g, bb) => Math.max(Math.abs(r - 0x3a), Math.abs(g - 0x5a), Math.abs(bb - 0x40)) > 60);
    assert.ok(ink.ink > 1500, `${a.id}/${a.lang} drew text (${ink.ink} px)`);
  });
  console.log(`       review frames: ${KEEP || path.join(PROJ, "render")}${path.sep}fontselect_*.png`);
});

t("no reflow: bold_pop (with emphasis) and karaoke_blob word changes stay within 0.2 % ink XOR with identical bbox; highlight moves on the exact frame; pop 85->100 %", async () => {
  const bp = style("bold_pop"), kb = style("karaoke_blob");
  const cueA = mkCue("c_0", WORDS4, { starts: [0, 0.4, 0.8, 1.3], end: 1.9, emph: [2] });
  const rA = A.buildAss({ cues: [cueA], style: bp, output: OUT, lang: "en" });
  // Negative control: the second event loses the emphasis scale -> real reflow.
  const cueN = mkCue("c_1", WORDS4, { t0: 3, starts: [0, 0.4, 0.8, 1.3], end: 1.9, emph: [2] });
  const rN = A.buildAss({ cues: [cueN], style: bp, output: OUT, lang: "en" });
  const lines = rN.text.split("\n");
  const second = lines.findIndex((l) => l.startsWith("Dialogue:")) + 1;
  lines[second] = lines[second].replace("{\\fscx112\\fscy112}", "").replace("{\\fscx100\\fscy100}", "");
  const textN = lines.join("\n");
  const cueB = mkCue("c_2", WORDS6, { t0: 5, lines: LINES6, starts: [0, 0.3, 0.6, 1.0, 1.3, 1.6], end: 2.0 });
  const rB = A.buildAss({ cues: [cueB], style: kb, output: OUT, lang: "en" });

  const boundsA = [12, 24, 39];
  const boundsB = [9, 18, 30, 39, 48].map((f) => 150 + f);
  const select = [...new Set([0, 1, 2, 3, 4, 6, 11, ...boundsA.flatMap((f) => [f - 1, f]), 50, 101, 102, ...boundsB.flatMap((f) => [f - 1, f]), 150 + 55])].sort((x, y) => x - y);
  const crop = { x: 0, y: 1130, w: 1080, h: 320 };
  const b = await burn("reflow", { asses: [{ r: rA }, { r: rN, text: textN }, { r: rB }], dur: 7.2, select, crop, png: true });
  const W = crop.w, H = crop.h;
  const ink = (n) => mask(b.at(n), W, H, offGreen);
  const brandA = (n) => mask(b.at(n), W, H, nearHex(bp.colors.highlight, 60));

  let worst = 0;
  for (const f of boundsA) {
    const s = xorStats(ink(f - 1), ink(f));
    worst = Math.max(worst, s.frac);
    assert.ok(s.frac <= 0.002, `bold_pop frame ${f - 1}->${f}: XOR ${s.xor}/${s.inkA} = ${(s.frac * 100).toFixed(3)} %`);
    assert.deepEqual(s.bboxA, s.bboxB, `bold_pop bbox at ${f}`);
    const pa = brandA(f - 1).bbox, pb = brandA(f).bbox;
    assert.ok(pa && pb && pb.cx > pa.cx + 40, `highlight moved right exactly at frame ${f} (${pa && pa.cx} -> ${pb && pb.cx})`);
  }
  assert.deepEqual(brandA(12).bbox, brandA(23).bbox, "highlight steady inside an interval");
  const steady = ink(11).bbox;
  const w0 = ink(0).bbox;
  const ratio0 = w0.w / steady.w;
  assert.ok(Math.abs(ratio0 - 0.85) <= 0.02, `pop frame 0 width ratio ${ratio0.toFixed(3)}`);
  const widths = [0, 1, 2, 3, 4].map((n) => ink(n).bbox.w);
  for (let k = 1; k < widths.length; k++) assert.ok(widths[k] >= widths[k - 1], `pop grows monotonically ${widths}`);
  assert.ok(Math.abs(widths[4] - steady.w) <= 1, `pop done by frame 4 (${widths[4]} vs ${steady.w})`);
  assert.ok(Math.abs(ink(0).bbox.y1 - steady.y1) <= 1, "pop anchored at the bottom (\\an2)");

  const neg = xorStats(ink(101), ink(102));
  assert.ok(neg.frac > 0.02 && JSON.stringify(neg.bboxA) !== JSON.stringify(neg.bboxB), `negative control reflows (XOR ${(neg.frac * 100).toFixed(2)} %)`);

  const brandB = (n) => mask(b.at(n), W, H, nearHex(kb.colors.highlight, 60));
  let worstB = 0;
  const centres = [];
  for (const f of boundsB) {
    const A0 = ink(f - 1), A1 = ink(f), P0 = brandB(f - 1), P1 = brandB(f);
    const both = new Uint8Array(W * H);
    for (let i = 0; i < both.length; i++) both[i] = P0.m[i] | P1.m[i];
    const zone = dilate(both, W, H, 20);
    const s = xorStats(A0, A1, zone);
    worstB = Math.max(worstB, s.frac);
    assert.ok(s.frac <= 0.002, `karaoke_blob frame ${f - 1}->${f}: XOR ${s.xor}/${s.inkA} = ${(s.frac * 100).toFixed(3)} % outside the blobs`);
    assert.deepEqual(s.bboxA, s.bboxB, `karaoke_blob bbox at ${f}`);
    centres.push(P0.bbox);
    if (f === boundsB[boundsB.length - 1]) centres.push(P1.bbox);
  }
  const text = ink(150 + 55).bbox;
  centres.forEach((c, k) => {
    assert.ok(c && c.h <= 110, `blob ${k} covers one word on one line (h ${c && c.h})`);
    assert.ok(c.w <= text.w * 0.5, `blob ${k} is one word wide (w ${c.w} of ${text.w}) — alpha restored after the active word`);
  });
  for (const k of [1, 2, 4, 5]) assert.ok(centres[k].cx > centres[k - 1].cx, `blob moves right within a line (${k})`);
  assert.ok(centres[3].cy > centres[2].cy + 40, "blob drops to line 2");
  console.log(`       bold_pop worst XOR ${(worst * 100).toFixed(3)} %, karaoke_blob worst XOR ${(worstB * 100).toFixed(3)} %, negative control ${(neg.frac * 100).toFixed(2)} %, pop f0 ratio ${ratio0.toFixed(3)}`);
});

t("Arabic highlight keeps RTL word order and joining (Encoding -1); the same text with Encoding 1 reorders (control)", async () => {
  const st = style("bold_pop", "ar");
  const words = ["مرحبا", "بالعالم", "هذا", "اختبار"];
  const starts = [0, 0.5, 1.0, 1.5];
  const rH = A.buildAss({ cues: [mkCue("c_0", words, { starts, end: 2.0 })], style: st, output: OUT, lang: "ar" });
  const rP = A.buildAss({ cues: [mkCue("c_1", words, { t0: 2.5, end: 0.9 })], style: st, output: OUT, lang: "ar", highlight: "none" });
  const rC = A.buildAss({ cues: [mkCue("c_2", words, { t0: 3.5, starts, end: 2.0 })], style: st, output: OUT, lang: "ar" });
  const textC = rC.text.replace(/,-1$/m, ",1");
  assert.notEqual(textC, rC.text);
  const mids = [10, 25, 40, 55];
  const select = [...mids, 90, ...mids.map((m) => 105 + m)];
  const crop = { x: 0, y: 1230, w: 1080, h: 220 };
  const b = await burn("arabic", { asses: [{ r: rH }, { r: rP }, { r: rC, text: textC }], dur: 6, select, crop, png: true });
  const W = crop.w, H = crop.h;
  const ink = (n) => mask(b.at(n), W, H, offGreen);
  const brand = (n) => mask(b.at(n), W, H, nearHex(st.colors.highlight, 60)).bbox;
  const plain = ink(90);
  const cx = mids.map((m) => brand(m).cx);
  for (let k = 1; k < cx.length; k++) assert.ok(cx[k] < cx[k - 1] - 20, `RTL: word ${k} left of word ${k - 1} (${cx.join(" > ")})`);
  let worst = 0;
  for (const m of mids) {
    const s = xorStats(plain, ink(m));
    worst = Math.max(worst, s.frac);
    assert.ok(s.frac <= 0.01, `highlight frame ${m} vs plain: XOR ${s.xor}/${s.inkA} = ${(s.frac * 100).toFixed(2)} % (joined shapes unchanged)`);
    assert.deepEqual(s.bboxA, s.bboxB, `bbox unchanged at ${m}`);
  }
  const cxC = mids.map((m) => brand(105 + m).cx);
  const decreasing = cxC.every((v, k) => k === 0 || v < cxC[k - 1] - 20);
  const ctrl = Math.max(...mids.map((m) => xorStats(plain, ink(105 + m)).frac));
  assert.ok(!decreasing || ctrl > 0.05, `Encoding 1 control must reorder (cx ${cxC.join(", ")}, XOR ${(ctrl * 100).toFixed(1)} %)`);
  console.log(`       Encoding -1 colour x: ${cx.map((v) => v.toFixed(0)).join(" > ")}; worst XOR vs plain ${(worst * 100).toFixed(2)} %; Encoding 1 control x: ${cxC.map((v) => v.toFixed(0)).join(", ")}, XOR ${(ctrl * 100).toFixed(1)} %`);
});

t("brand highlight colour decodes as BT.709 within ΔE2000 ≤ 2 through yuv420p + libx264 (BT.601 decode as control)", async () => {
  const st = style("bold_pop");
  const r = A.buildAss({ cues: [mkCue("c_0", ["MMWMM", "BRAND"], { starts: [0, 0.2], end: 1.0 })], style: st, output: OUT, lang: "en" });
  const rel = `render/cache/ass/brand_${r.assHash.slice(0, 10)}.ass`;
  A.writeAssFile(PROJ, rel, r.text);
  A.copyFontsForAss(PROJ, r.fonts);
  fs.writeFileSync(path.join(PROJ, "render", "brand_enc.fcs"),
    `[0:v]format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,${A.burnInArgs({ assRelPath: rel })}[v]`);
  await proc.ffmpeg(["-y", "-protocol_whitelist", "file", "-f", "lavfi", "-i", "color=c=0x404040:s=1080x1920:r=30:d=1",
    "-/filter_complex", "render/brand_enc.fcs", "-map", "[v]", "-frames:v", "20", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-r", "30", "-video_track_timescale", "30000", "-bf", "0", "-threads", "3", "render/brand.mp4"], { cwd: PROJ, timeoutMs: 120000, pidFile: null });
  const probe = await proc.ffprobeJson(["-protocol_whitelist", "file", "-f", "mp4", "-show_streams", "-of", "json", "file:render/brand.mp4"], { cwd: PROJ, pidFile: null });
  const vs = probe.streams.find((s) => s.codec_type === "video");
  assert.equal(vs.color_space, "bt709"); assert.equal(vs.color_primaries, "bt709"); assert.equal(vs.color_transfer, "bt709"); assert.equal(vs.color_range, "tv");
  const crop = { x: 0, y: 1250, w: 1080, h: 200 };
  const decode = async (matrix) => {
    fs.writeFileSync(path.join(PROJ, "render", `brand_${matrix}.fcs`),
      `[0:v]select='eq(n${BS},15)',scale=in_color_matrix=${matrix}:in_range=tv:out_range=pc,format=rgb24,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}[v]`);
    await proc.ffmpeg(["-y", "-protocol_whitelist", "file", "-f", "mp4", "-i", "file:render/brand.mp4", "-/filter_complex", `render/brand_${matrix}.fcs`,
      "-map", "[v]", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", `render/brand_${matrix}.rgb`], { cwd: PROJ, timeoutMs: 60000, pidFile: null });
    const px = fs.readFileSync(path.join(PROJ, "render", `brand_${matrix}.rgb`));
    const m = mask(px, crop.w, crop.h, nearHex(st.colors.highlight, 70));
    const core = erodeCount(m.m, crop.w, crop.h, 3, px);
    return { core, de: deltaE2000(core.mean, rgbOf(st.colors.highlight)) };
  };
  const d709 = await decode("bt709");
  const d601 = await decode("bt601");
  assert.ok(d709.core.n >= 200, `enough interior brand pixels (${d709.core.n})`);
  assert.ok(d709.de <= 2, `ΔE2000 as BT.709 = ${d709.de.toFixed(2)} (mean ${d709.core.mean.map((v) => v.toFixed(1))} vs ${st.colors.highlight})`);
  console.log(`       brand ${st.colors.highlight}: BT.709 decode mean ${d709.core.mean.map((v) => v.toFixed(1)).join(",")} ΔE2000 ${d709.de.toFixed(2)} (${d709.core.n} px); BT.601 decode ΔE2000 ${d601.de.toFixed(2)}`);
});

t("timing: 30 s / 60 cues / 240 events bold_pop burn vs no-ASS baseline (1080x1920 H.264 decode to null, as S3)", async () => {
  const st = style("bold_pop");
  const vocab = ["WATCH", "THIS", "QUICK", "TIP", "SAVE", "TIME", "EVERY", "DAY", "GROW", "YOUR", "CHANNEL", "FAST", "BETTER", "EDITS", "NOW", "TODAY"];
  const cues = [];
  for (let c = 0; c < 60; c++) {
    const words = [0, 1, 2, 3].map((j) => vocab[(c * 5 + j * 3) % vocab.length]);
    cues.push(mkCue(`c_${c * 4}`, words, { t0: c * 0.5, starts: [0, 0.12, 0.24, 0.36], end: 0.5 }));
  }
  const t0 = process.hrtime.bigint();
  const r = A.buildAss({ cues, style: st, output: OUT, lang: "en" });
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(r.eventCount, 240);
  const rel = `render/cache/ass/timing_${r.assHash.slice(0, 10)}.ass`;
  A.writeAssFile(PROJ, rel, r.text);
  A.copyFontsForAss(PROJ, r.fonts);
  fs.writeFileSync(path.join(PROJ, "render", "timing_ass.fcs"), `[0:v]${A.burnInArgs({ assRelPath: rel })}[v]`);
  fs.writeFileSync(path.join(PROJ, "render", "timing_base.fcs"), "[0:v]null[v]");
  const mk = await proc.ffmpeg(["-y", "-protocol_whitelist", "file", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=30",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-g", "60", "-bf", "0", "-threads", "3", "render/base30.mp4"],
  { cwd: PROJ, timeoutMs: 200000, pidFile: null });
  const runOne = (graph) => proc.ffmpeg(["-y", "-protocol_whitelist", "file", "-f", "mp4", "-i", "file:render/base30.mp4",
    "-/filter_complex", graph, "-map", "[v]", "-f", "null", "-"], { cwd: PROJ, timeoutMs: 200000, pidFile: null });
  console.log(`       base30.mp4 (testsrc2 ultrafast) built in ${mk.durationMs} ms`);
  const base = await runOne("render/timing_base.fcs");
  const withAss = await runOne("render/timing_ass.fcs");
  const perFrameMs = (withAss.durationMs - base.durationMs) / 900;
  console.log(`       buildAss 60 cues/240 events: ${buildMs.toFixed(1)} ms, ${r.text.length} bytes; burn 900 frames: ${withAss.durationMs} ms with ASS vs ${base.durationMs} ms without (≈ ${perFrameMs.toFixed(2)} ms/frame)`);
  assert.ok(buildMs < 1000);
  assert.ok(withAss.durationMs < base.durationMs + 60000, "ASS burn cost bounded");
});

run().then(() => {
  restoreFetch();
  tmp.cleanup();
});
