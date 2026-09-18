// VIDEO EDIT CAPTION FONT NAMES — what libass sees for each bundled TTF (RENDER.md §6, spike F0/S3).
//
// WHY THIS EXISTS. libass matches an ASS `Fontname` against the Windows-platform name-table family
// (name ID 1) or full name (ID 4) of the files in `fontsdir`. The PostScript name, or a near miss like
// "ArchivoBlack", does not match; libass then falls back SILENTLY to a system font (ArialMT on this
// host), and the burnt-in captions ship in the wrong face. A glyph missing from the chosen face falls
// back silently the same way: Noto Sans Devanagari and Noto Sans Arabic have no Basic Latin letters,
// and Noto Sans Arabic has almost no ASCII punctuation. So the ASS writer never guesses: family names
// and weights come from the shipped manifest (checked against the real name table in tests), glyph
// coverage comes from each file's own cmap, and render QA parses libass's `fontselect:` log lines to
// prove every selection landed on a bundled file.
//
// CONTRACT:
//   FONTS_DIR_ABS                     absolute path of server/assets/fonts/edit
//   readFont(file) -> { file, bytes, magic, flavour, variable, family, subfamily, fullName, postscriptName,
//                       typographicFamily, libassFamilies, libassFullNames, weight, bold, italic, scripts,
//                       extras:{digits, asciiPunct, space}, tables }        (dependency-free sfnt reader)
//   readManifest({ dir }?) -> frozen [{ file, family, weight, scripts, sha256, bytes }]   (cached per dir)
//     throws EditError FONT_MANIFEST_INVALID (config) when the manifest is missing or malformed.
//   entryForFamily(family) · entryForFile(file) -> manifest entry | null
//   scriptForLang(lang) -> 'Deva' | 'Arab' | 'Jpan' | 'Latn'
//   fontForScript(lang) -> manifest entry of the bundled script face for hi/ar/ja, null for Latin languages
//   latinFallbackFamily(styleIdOrFamily?) -> the bundled Latin family to wrap Latin runs in (a style's own
//     Latin face when given a style id or a Latin family; 'DM Sans' otherwise)
//   assBoldFor(family) -> -1 for a ≥ 700-weight file, 0 otherwise (Bold=-1 on a 400 file synthesises bold)
//   hasGlyph(family, codePoint) -> boolean (cmap format 4/12 of the bundled file)
//   postscriptNameFor(family) -> name ID 6 (what libass prints on the right of a fontselect line)
//   parseFontselect(log) -> { selections:[{ family, weight, italic, psName }], misses:[{ codePoint, family, weight }] }
//   checkFontselect(log, { families }?) -> { ok, selections, misses, problems:string[] }
//     ok when every selection resolves to the bundled file of its family, no glyph was missing, and every
//     family in `families` was selected at least once.

const fs = require("node:fs");
const path = require("node:path");
const { EditError } = require("../errors");

const FONTS_DIR_ABS = path.resolve(__dirname, "..", "..", "..", "assets", "fonts", "edit");
const DEFAULT_LATIN_FAMILY = "DM Sans";

const MAGIC = { 0x00010000: "truetype", 0x4f54544f: "cff", 0x74727565: "truetype", 0x74746366: "collection" };

const u16 = (b, o) => b.readUInt16BE(o);
const u32 = (b, o) => b.readUInt32BE(o);

function decodeUtf16be(buf) {
  const out = Buffer.alloc(buf.length - (buf.length % 2));
  for (let i = 0; i + 1 < buf.length; i += 2) { out[i] = buf[i + 1]; out[i + 1] = buf[i]; }
  return out.toString("utf16le");
}

function bad(detail) {
  return new EditError("FONT_INVALID", { status: 500, errorClass: "config", detail });
}

function tableDirectory(buf, offset = 0) {
  if (buf.length < offset + 12) throw bad("file too small for an sfnt header");
  const tag = u32(buf, offset);
  const flavour = MAGIC[tag];
  if (!flavour || flavour === "collection") throw bad(`not a single sfnt font (magic 0x${tag.toString(16)})`);
  const numTables = u16(buf, offset + 4);
  if (buf.length < offset + 12 + numTables * 16) throw bad("truncated table directory");
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const r = offset + 12 + i * 16;
    const t = buf.toString("latin1", r, r + 4);
    tables[t] = { offset: u32(buf, r + 8), length: u32(buf, r + 12) };
    if (tables[t].offset + tables[t].length > buf.length) throw bad(`table ${t} out of bounds`);
  }
  return { magic: tag, flavour, tables };
}

function readNames(buf, t) {
  const base = t.offset;
  const count = u16(buf, base + 2);
  const strOff = base + u16(buf, base + 4);
  const recs = [];
  for (let i = 0; i < count; i++) {
    const r = base + 6 + i * 12;
    const platformID = u16(buf, r), encodingID = u16(buf, r + 2), languageID = u16(buf, r + 4);
    const nameID = u16(buf, r + 6), length = u16(buf, r + 8), off = u16(buf, r + 10);
    if (strOff + off + length > buf.length) continue;
    const raw = buf.subarray(strOff + off, strOff + off + length);
    let value;
    if (platformID === 3 || platformID === 0) value = decodeUtf16be(raw);
    else if (platformID === 1 && encodingID === 0) value = raw.toString("latin1");
    else continue;
    recs.push({ platformID, encodingID, languageID, nameID, value });
  }
  return recs;
}

// Windows en-US first (what libass matches), then any Windows record, then any platform.
function pickName(recs, id) {
  const win = recs.filter((r) => r.platformID === 3 && r.nameID === id);
  const hit = win.find((r) => r.languageID === 0x409) || win[0] || recs.find((r) => r.nameID === id);
  return hit ? hit.value : null;
}

// cmap format 4 / 12 subtable → (codePoint) => glyphId (0 = missing).
function cmapLookup(buf, t) {
  const base = t.offset;
  const n = u16(buf, base + 2);
  let best = null, bestRank = -1;
  for (let i = 0; i < n; i++) {
    const r = base + 4 + i * 8;
    const pid = u16(buf, r), off = base + u32(buf, r + 4);
    const fmt = u16(buf, off);
    const rank = fmt === 12 ? 3 : (fmt === 4 && (pid === 3 || pid === 0)) ? 2 : -1;
    if (rank > bestRank) { best = { fmt, off }; bestRank = rank; }
  }
  if (!best) return () => 0;
  const { fmt, off } = best;
  if (fmt === 4) {
    const segX2 = u16(buf, off + 6), seg = segX2 / 2;
    const ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, rangeOffs = deltas + segX2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      let lo = 0, hi = seg - 1;
      while (lo <= hi) { // endCode is sorted ascending: first segment with end >= cp
        const mid = (lo + hi) >> 1;
        if (u16(buf, ends + mid * 2) < cp) lo = mid + 1; else hi = mid - 1;
      }
      if (lo >= seg) return 0;
      const s = lo;
      const start = u16(buf, starts + s * 2);
      if (cp < start) return 0;
      const delta = u16(buf, deltas + s * 2), ro = u16(buf, rangeOffs + s * 2);
      if (ro === 0) return (cp + delta) & 0xffff;
      const g = u16(buf, rangeOffs + s * 2 + ro + (cp - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    };
  }
  const groups = u32(buf, off + 12);
  return (cp) => {
    let lo = 0, hi = groups - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, g = off + 16 + mid * 12;
      const s = u32(buf, g), e = u32(buf, g + 4);
      if (cp < s) hi = mid - 1; else if (cp > e) lo = mid + 1; else return u32(buf, g + 8) + (cp - s);
    }
    return 0;
  };
}

// A script (ISO 15924) is covered when every probe code point maps to a real glyph.
const SCRIPT_PROBES = Object.freeze({
  Latn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  Deva: "नमस्तेदुनियायहएकपरीक्षणहै",
  Arab: "مرحبابالعالمهذااختبار",
  Jpan: "こんにちは世界、これはテストです",
});
const EXTRA_PROBES = Object.freeze({ digits: "0123456789", asciiPunct: ".,!?'\"-:;()%&", space: " " });

function readFont(file) {
  const buf = fs.readFileSync(file);
  const dir = tableDirectory(buf, 0);
  if (!dir.tables.name) throw bad("no name table");
  const recs = readNames(buf, dir.tables.name);
  let weight = null, fsSelection = null;
  if (dir.tables["OS/2"] && dir.tables["OS/2"].length >= 64) {
    weight = u16(buf, dir.tables["OS/2"].offset + 4);
    fsSelection = u16(buf, dir.tables["OS/2"].offset + 62);
  }
  const lookup = dir.tables.cmap ? cmapLookup(buf, dir.tables.cmap) : () => 0;
  const covers = (s) => [...s].every((ch) => lookup(ch.codePointAt(0)) !== 0);
  return {
    file,
    bytes: buf.length,
    magic: `0x${dir.magic.toString(16).padStart(8, "0")}`,
    flavour: dir.flavour,
    variable: Boolean(dir.tables.fvar),
    family: pickName(recs, 1),
    subfamily: pickName(recs, 2),
    fullName: pickName(recs, 4),
    postscriptName: pickName(recs, 6),
    typographicFamily: pickName(recs, 16),
    libassFamilies: [...new Set(recs.filter((r) => r.platformID === 3 && r.nameID === 1).map((r) => r.value))],
    libassFullNames: [...new Set(recs.filter((r) => r.platformID === 3 && r.nameID === 4).map((r) => r.value))],
    weight,
    bold: fsSelection == null ? null : Boolean(fsSelection & 0x20),
    italic: fsSelection == null ? null : Boolean(fsSelection & 0x01),
    scripts: Object.entries(SCRIPT_PROBES).filter(([, s]) => covers(s)).map(([k]) => k),
    extras: Object.fromEntries(Object.entries(EXTRA_PROBES).map(([k, s]) => [k, covers(s)])),
    tables: Object.keys(dir.tables).sort(),
  };
}

// ---- manifest ------------------------------------------------------------------------------
const manifests = new Map(); // dir -> frozen entries

function readManifest({ dir = FONTS_DIR_ABS } = {}) {
  const key = path.resolve(dir);
  if (manifests.has(key)) return manifests.get(key);
  let list;
  try { list = JSON.parse(fs.readFileSync(path.join(key, "manifest.json"), "utf8")); }
  catch (e) {
    throw new EditError("FONT_MANIFEST_INVALID", { status: 500, errorClass: "config", detail: e && e.code ? e.code : "unreadable manifest" });
  }
  const ok = Array.isArray(list) && list.length > 0 && list.every((e) => e && typeof e.file === "string" && /^[A-Za-z0-9_.-]+\.ttf$/.test(e.file)
    && typeof e.family === "string" && e.family && Number.isInteger(e.weight) && Array.isArray(e.scripts)
    && typeof e.sha256 === "string" && Number.isInteger(e.bytes));
  if (!ok) throw new EditError("FONT_MANIFEST_INVALID", { status: 500, errorClass: "config", detail: "manifest entries malformed" });
  const frozen = Object.freeze(list.map((e) => Object.freeze({
    file: e.file, family: e.family, weight: e.weight, scripts: Object.freeze([...e.scripts]), sha256: e.sha256, bytes: e.bytes,
  })));
  manifests.set(key, frozen);
  return frozen;
}

function entryForFamily(family) {
  const f = String(family || "").toLowerCase();
  return readManifest().find((e) => e.family.toLowerCase() === f) || null;
}

function entryForFile(file) {
  const f = path.basename(String(file || ""));
  return readManifest().find((e) => e.file === f) || null;
}

const LANG_SCRIPT = Object.freeze({ hi: "Deva", ar: "Arab", ja: "Jpan" });

function scriptForLang(lang) {
  return LANG_SCRIPT[String(lang || "en").toLowerCase().slice(0, 2)] || "Latn";
}

function fontForScript(lang) {
  const script = scriptForLang(lang);
  if (script === "Latn") return null;
  const hits = readManifest().filter((e) => e.scripts.includes(script));
  // Prefer the face whose primary coverage is the script (Noto Sans JP also covers Latin).
  return hits.find((e) => e.scripts[e.scripts.length - 1] === script) || hits[0] || null;
}

function isLatinOnly(entry) {
  return !!entry && entry.scripts.length === 1 && entry.scripts[0] === "Latn";
}

function latinFallbackFamily(styleIdOrFamily) {
  if (styleIdOrFamily) {
    const asFamily = entryForFamily(styleIdOrFamily);
    if (isLatinOnly(asFamily)) return asFamily.family;
    const { STYLE_PRESETS } = require("./styles");
    const preset = Object.prototype.hasOwnProperty.call(STYLE_PRESETS, styleIdOrFamily) ? STYLE_PRESETS[styleIdOrFamily] : null;
    const fromStyle = preset ? entryForFamily(preset.font.family) : null;
    if (isLatinOnly(fromStyle)) return fromStyle.family;
  }
  return DEFAULT_LATIN_FAMILY;
}

function assBoldFor(family) {
  const e = entryForFamily(family);
  return e && e.weight >= 700 ? -1 : 0;
}

// ---- per-file glyph lookups (lazy; the JP file is 5.5 MB) --------------------------------------
const fileInfo = new Map(); // abs file -> { lookup, postscriptName }

function infoFor(family) {
  const e = entryForFamily(family);
  if (!e) return null;
  const abs = path.join(FONTS_DIR_ABS, e.file);
  if (!fileInfo.has(abs)) {
    const buf = fs.readFileSync(abs);
    const dir = tableDirectory(buf, 0);
    const recs = dir.tables.name ? readNames(buf, dir.tables.name) : [];
    fileInfo.set(abs, {
      lookup: dir.tables.cmap ? cmapLookup(buf, dir.tables.cmap) : () => 0,
      postscriptName: pickName(recs, 6),
    });
  }
  return fileInfo.get(abs);
}

function hasGlyph(family, codePoint) {
  const info = infoFor(family);
  return !!info && info.lookup(codePoint) !== 0;
}

function postscriptNameFor(family) {
  const info = infoFor(family);
  return info ? info.postscriptName : null;
}

// ---- libass log QA ---------------------------------------------------------------------------
const FONTSELECT_RE = /fontselect: \((.+?), (\d+), (\d+)\) -> ([^,\r\n]+),/g;
const MISS_RE = /Glyph 0x([0-9A-Fa-f]+) not found, selecting one more font for \((.+?), (\d+), (\d+)\)/g;

function parseFontselect(log) {
  const text = String(log || "");
  const selections = [];
  const misses = [];
  for (const m of text.matchAll(FONTSELECT_RE)) {
    selections.push({ family: m[1], weight: Number(m[2]), italic: Number(m[3]), psName: m[4].trim() });
  }
  for (const m of text.matchAll(MISS_RE)) {
    misses.push({ codePoint: parseInt(m[1], 16), family: m[2], weight: Number(m[3]) });
  }
  return { selections, misses };
}

function checkFontselect(log, { families = [] } = {}) {
  const { selections, misses } = parseFontselect(log);
  const problems = [];
  for (const s of selections) {
    const expected = postscriptNameFor(s.family);
    if (!expected) problems.push(`family '${s.family}' is not bundled (selected ${s.psName})`);
    else if (expected !== s.psName) problems.push(`'${s.family}' ${s.weight} resolved to ${s.psName}, expected ${expected}`);
  }
  for (const m of misses) problems.push(`glyph U+${m.codePoint.toString(16).toUpperCase().padStart(4, "0")} missing in '${m.family}'`);
  for (const f of families) {
    if (!selections.some((s) => s.family.toLowerCase() === String(f).toLowerCase())) problems.push(`family '${f}' was never selected`);
  }
  return { ok: problems.length === 0, selections, misses, problems };
}

module.exports = {
  FONTS_DIR_ABS, DEFAULT_LATIN_FAMILY, SCRIPT_PROBES,
  readFont, tableDirectory, readNames, cmapLookup,
  readManifest, entryForFamily, entryForFile, scriptForLang, fontForScript, latinFallbackFamily, assBoldFor,
  hasGlyph, postscriptNameFor, parseFontselect, checkFontselect,
};
