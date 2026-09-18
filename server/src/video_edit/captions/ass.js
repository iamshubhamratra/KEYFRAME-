// VIDEO EDIT ASS WRITER — placed caption cues -> one libass script (RENDER.md §6 "ASS", spike S3).
//
// WHY THIS EXISTS. Captions are burnt in by libass in the composite pass, and every visible caption
// defect traces back to a byte in this file: a family name libass cannot match silently becomes Arial,
// a Bold flag on a 400-weight face synthesises a fake bold, an untagged matrix shifts the brand colour
// by ΔE ≈ 5, an override placed differently in two events makes the line jump when the highlight moves,
// and a Style with Encoding 1 scrambles Arabic word order as soon as one word is coloured. S3 measured
// each of those. So the writer is deterministic and literal: family/weight from the font manifest,
// Encoding -1 on every Style, TV.709 matrix, PlayRes = output size, and one Dialogue per active-word
// interval with the SAME position and the SAME text in every event — only colour/alpha/underline tags
// (which never change advance) move. Glyph coverage is checked against each bundled file's cmap, and a
// run the cue's face cannot draw (Latin letters inside Hindi/Arabic, ASCII punctuation inside Arabic) is
// wrapped in `\fn` to a bundled face that can, so libass never has to fall back to a system font.
//
// CONTRACT:
//   buildAss({ cues, style, output:{w,h}|{width,height}, lang?, brand?, highlight? }) ->
//     { text, fonts:[ttf], families:[family], eventCount, cueCount, highlight, missingGlyphs:[hex], assHash }
//     cues: placed Cue[] (EDIT_PLAN.md §2; output timeline). hidden / collapsed / zero-frame cues are skipped.
//     style: captions/styles.resolveStyle(...) result, or a style id (resolved here with brand, lang, output).
//     highlight: plan.captions.highlight ('none'|'color'|'blob'|'sweep'|'single_word'); default style.highlight.
//     Cues with timingMode 'proportional' always render as one event with the entry animation, no highlight.
//   escapeAssText(s) -> text safe for a Dialogue: { -> \{ · } -> \} · \ -> \ + U+2060 · newline -> \N
//   assTime(frame) -> 'H:MM:SS.cc' (largest centisecond <= frame start: frame-exact at 30 fps)
//   burnInArgs({ assRelPath, fontsDirRel='fonts' }) -> 'ass=f=<rel>:fontsdir=<rel>:shaping=complex'
//   copyFontsForAss(projectDir, fonts) -> { dir, rel:'fonts', files, copied }   (manifest-checked, atomic)
//   writeAssFile(projectDir, assRelPath, text) -> absolute path (atomic)
//   assRelPathFor(assHash) -> 'render/cache/ass/<assHash>.ass'
// Escaping note (measured on this libass 0.17.4, see ass test): '\\' renders two backslashes and does
// not neutralise '\N', so a literal backslash is followed by U+2060 WORD JOINER (zero-width, no font
// fallback) instead of being doubled.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { EditError } = require("../errors");
const fsx = require("../fsx");
const fontname = require("./fontname");
const { resolveStyle } = require("./styles");
const { bandsFor } = require("./place");

const FPS = 30;
const WJ = "⁠";
const STYLE_NAME = "Cap";
const BLOB_BORDER_PX = 14;
const BLOB_BLUR_PX = 2;
const SHADOW_OPACITY = 0.5;
const BOX_PAD_EM = 0.22;
const REFERENCE_SHORT_EDGE = 1080;

const STYLE_FORMAT = "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding";
const EVENT_FORMAT = "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";

function invalid(detail) {
  return new EditError("ASS_INVALID_INPUT", { status: 500, errorClass: "bug", detail });
}

// ---- primitives ------------------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => String(Math.round(v * 100) / 100);

function bgr(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex == null ? "" : hex).trim());
  if (!m) throw invalid(`bad colour '${hex}'`);
  const h = m[1].toUpperCase();
  return h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
}
// ASS alpha is inverted: 00 = opaque, FF = transparent.
const alphaHex = (opacity) => Math.round((1 - clamp(Number(opacity), 0, 1)) * 255).toString(16).toUpperCase().padStart(2, "0");
const styleColour = (hex, opacity = 1) => `&H${alphaHex(opacity)}${bgr(hex)}`;
const tagColour = (hex) => `&H${bgr(hex)}&`;

function frameOf(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s)) throw invalid(`bad time ${sec}`);
  return Math.max(0, Math.round(s * FPS + 1e-9));
}

// Frame f starts at f/30 s; libass shows an event on a frame when start_ms <= frame_ms < end_ms, and
// the ass filter rounds frame pts to ms. The largest centisecond not after f/30 is always strictly
// after frame f-1, so boundaries land on exactly the intended frame (a rounded 2-decimal time does not).
const csOf = (frame) => Math.floor((frame * 10) / 3);

function assTime(frame) {
  const cs = csOf(frame);
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function escapeAssText(s) {
  let out = "";
  for (const ch of String(s == null ? "" : s)) {
    if (ch === "\\") out += `\\${WJ}`;
    else if (ch === "{") out += "\\{";
    else if (ch === "}") out += "\\}";
    else if (ch === "\n") out += "\\N";
    else if (ch === "\r") continue;
    else if (ch === "\t") out += " ";
    else out += ch;
  }
  return out;
}

// ---- font runs -------------------------------------------------------------------------------
const NEUTRAL_RE = /[\s\p{Cf}\p{M}]/u;

// latinHint: the style id (its own Latin face wraps Latin runs inside hi/ar cues) or a family.
function makeFontContext(family, latinHint = null) {
  const primary = fontname.entryForFamily(family);
  if (!primary) throw invalid(`caption family '${family}' is not a bundled font`);
  const latin = fontname.latinFallbackFamily(latinHint || family);
  const order = [latin, ...fontname.readManifest().map((e) => e.family)]
    .filter((f, i, a) => f !== primary.family && a.indexOf(f) === i);
  return { primary, order, used: new Set([primary.family]), missing: new Set(), cache: new Map() };
}

function familyForCodePoint(fc, cp) {
  if (fc.cache.has(cp)) return fc.cache.get(cp);
  let fam = fc.primary.family;
  if (!fontname.hasGlyph(fam, cp)) {
    const hit = fc.order.find((f) => fontname.hasGlyph(f, cp));
    if (hit) fam = hit;
    else fc.missing.add(cp);
  }
  fc.cache.set(cp, fam);
  return fam;
}

// Split text into runs by the bundled family that can draw each character. Whitespace, format
// characters and combining marks never start a switch: marks stay with their base, and a space stays
// inside a fallback run only when both neighbours use that same fallback face.
function fontRuns(fc, text) {
  const chars = [...text];
  const fams = chars.map((ch) => (NEUTRAL_RE.test(ch) ? null : familyForCodePoint(fc, ch.codePointAt(0))));
  for (let i = 0; i < chars.length; i++) {
    if (fams[i] != null) continue;
    const isMark = /\p{M}/u.test(chars[i]);
    const prev = i > 0 ? fams[i - 1] : null;
    if (isMark) { fams[i] = prev || fc.primary.family; continue; }
    let j = i + 1;
    while (j < chars.length && fams[j] == null && !/\p{M}/u.test(chars[j])) j++;
    const next = j < chars.length ? (fams[j] != null ? fams[j] : null) : null;
    fams[i] = prev && next && prev === next ? prev : fc.primary.family;
  }
  const runs = [];
  chars.forEach((ch, i) => {
    const last = runs[runs.length - 1];
    if (last && last.family === fams[i]) last.text += ch;
    else runs.push({ family: fams[i], text: ch });
  });
  return runs;
}

function renderRuns(fc, text) {
  let out = "";
  for (const r of fontRuns(fc, text)) {
    if (r.family === fc.primary.family) { out += escapeAssText(r.text); continue; }
    fc.used.add(r.family);
    const alt = fontname.entryForFamily(r.family);
    const weightTag = (e) => (e.weight >= 700 ? "\\b1" : "\\b0");
    const switchIn = `\\fn${r.family}${alt.weight !== fc.primary.weight ? weightTag(alt) : ""}`;
    const switchOut = `\\fn${fc.primary.family}${alt.weight !== fc.primary.weight ? weightTag(fc.primary) : ""}`;
    out += `{${switchIn}}${escapeAssText(r.text)}{${switchOut}}`;
  }
  return out;
}

// ---- cue layout ------------------------------------------------------------------------------
function joinerFor(lang) { return String(lang || "").slice(0, 2) === "ja" ? "" : " "; }
const visibleLen = (s) => [...String(s || "").replace(/\s+/g, "")].length;

// Assign cue.words to cue.lines in order (lines are the words joined by the language joiner).
function layoutWords(cue, lang) {
  const joiner = joinerFor(lang);
  const words = (Array.isArray(cue.words) ? cue.words : []).filter((w) => w && typeof w.text === "string" && w.text.trim());
  const lines = (Array.isArray(cue.lines) && cue.lines.length ? cue.lines : [cue.text || ""]).filter((l) => String(l).trim());
  if (!words.length) {
    // Text-only cue: tokens without timing.
    const toks = lines.map((l) => (joiner ? String(l).trim().split(/\s+/) : [String(l).trim()]));
    return toks.map((ts) => ts.filter(Boolean).map((t) => ({ text: t, emphasis: false, outStart: null })));
  }
  if (lines.length <= 1) return [words];
  const bounds = [];
  let acc = 0;
  for (const l of lines) { acc += visibleLen(l); bounds.push(acc); }
  const out = lines.map(() => []);
  let li = 0, c = 0;
  words.forEach((w, k) => {
    out[li].push(w);
    c += visibleLen(w.text);
    const wordsLeft = words.length - k - 1;
    if (li < lines.length - 1 && c >= bounds[li] && wordsLeft > 0) li++;
  });
  return out.filter((l) => l.length);
}

function cuePos(cue, style, W, H) {
  const bands = bandsFor(style.aspect);
  const p = cue.pos && Number.isFinite(cue.pos.y) ? cue.pos : { x: 0.5, y: bands.bottom.y, an: bands.bottom.an };
  const an = Number.isInteger(p.an) && p.an >= 1 && p.an <= 9 ? p.an : 2;
  return { x: Math.round(clamp(Number.isFinite(p.x) ? p.x : 0.5, 0, 1) * W), y: Math.round(clamp(p.y, 0, 1) * H), an };
}

// ---- builder ---------------------------------------------------------------------------------
function buildAss({ cues = [], style, output, lang, brand = null, highlight } = {}) {
  const W = Number(output && (output.w != null ? output.w : output.width));
  const H = Number(output && (output.h != null ? output.h : output.height));
  if (!Number.isInteger(W) || !Number.isInteger(H) || W <= 0 || H <= 0) throw invalid("output {w,h} must be positive integers");
  const S = typeof style === "string"
    ? resolveStyle(style, { brand, lang: lang || "en", aspect: W > H ? "16:9" : W < H ? "9:16" : "1:1", output: { width: W, height: H } })
    : style;
  if (!S || !S.font || !S.colors) throw invalid("style must be a resolved caption style or a style id");
  const L = String(lang || S.lang || "en").toLowerCase().slice(0, 2);
  const fc = makeFontContext(S.font.family, S.id);
  const scale = Math.min(W, H) / REFERENCE_SHORT_EDGE;
  const joiner = joinerFor(L);
  const C = S.colors;
  const prim = tagColour(C.primary);
  const hl = tagColour(C.highlight);
  const upper = (t) => (S.font.uppercase ? String(t).toLocaleUpperCase(L) : String(t));

  let mode = highlight != null ? String(highlight) : String(S.highlight || "none");
  if (!["none", "color", "blob", "sweep", "single_word"].includes(mode)) mode = "none";
  if (mode === "color" && S.activeWord !== "underline" && bgr(C.highlight) === bgr(C.primary)) mode = "none";

  const emphScale = Number(S.emphasisScale) > 0 ? Number(S.emphasisScale) * 100 : 100;
  const blobBord = Math.max(1, Math.round(BLOB_BORDER_PX * scale));
  const blobBlur = Math.max(1, Math.round(BLOB_BLUR_PX * scale * 100) / 100);

  // Style line.
  const boxed = !!(S.box && S.box.enabled);
  const sizePx = S.font.sizePx;
  const styleLine = [
    `Style: ${STYLE_NAME}`, S.font.family, sizePx,
    styleColour(C.primary), styleColour(C.primary),
    boxed ? styleColour(C.box, S.box.alpha) : styleColour(C.outline),
    boxed ? styleColour("#000000", 0) : styleColour(C.shadow, SHADOW_OPACITY),
    fontname.assBoldFor(S.font.family), 0, 0, 0, 100, 100, num(S.font.spacing || 0), 0,
    boxed ? 3 : 1,
    boxed ? num(Math.max(Number(S.outlinePx) || 0, Math.round(sizePx * BOX_PAD_EM))) : num(Number(S.outlinePx) || 0),
    boxed ? 0 : num(Number(S.shadowPx) || 0),
    2, 0, 0, 0, -1,
  ].join(",");

  const events = [];
  let cueCount = 0;
  const dlg = (layer, fa, fb, text) => events.push(`Dialogue: ${layer},${assTime(fa)},${assTime(fb)},${STYLE_NAME},,0,0,0,,${text}`);

  const sorted = (Array.isArray(cues) ? cues : [])
    .filter((c) => c && !c.hidden && c.resolved && !c.resolved.collapsed)
    .slice()
    .sort((a, b) => a.resolved.outIn - b.resolved.outIn);

  for (const cue of sorted) {
    const f0 = frameOf(cue.resolved.outIn);
    const f1 = frameOf(cue.resolved.outOut);
    if (f1 <= f0) continue;
    const lines = layoutWords(cue, L);
    const flat = lines.flat();
    if (!flat.length) continue;
    cueCount++;
    const pos = cuePos(cue, S, W, H);
    const posTag = `\\an${pos.an}\\pos(${pos.x},${pos.y})`;
    const cueMode = cue.timingMode === "proportional" ? "none" : mode;
    const emphColour = (cueMode === "none" || cueMode === "single_word") && bgr(C.emphasis) !== bgr(C.primary) ? tagColour(C.emphasis) : null;

    // Active-word intervals in frames: [wf[k], wf[k+1]).
    const wf = flat.map((w, k) => (k === 0 || w.outStart == null ? f0 : clamp(frameOf(w.outStart), f0, f1)));
    for (let k = 1; k < wf.length; k++) wf[k] = Math.max(wf[k], wf[k - 1]);
    const bound = (k) => (k + 1 < wf.length ? wf[k + 1] : f1);
    const msBetween = (fa, fb) => (csOf(fb) - csOf(fa)) * 10;

    // Entry animation for an event that lasts `ms`.
    const entryFor = (ms, baseScale = 100) => {
      const E = Math.min(Number(S.entryMs) || 0, ms);
      if (E <= 0) return { head: "", E: 0, from: null };
      if (S.entry === "pop") {
        const from = clamp(Number(S.entryFrom) || 1, 0.1, 1) * 100;
        return { head: `\\fscx${num((from * baseScale) / 100)}\\fscy${num((from * baseScale) / 100)}\\t(0,${E},\\fscx${num(baseScale)}\\fscy${num(baseScale)})`, E, from };
      }
      if (S.entry === "fade") return { head: `\\fad(${E},0)`, E, from: null };
      return { head: "", E: 0, from: null };
    };

    // Emphasis scale wrappers; during a pop every scale block animates with the same timing.
    const scaleOpen = (w, entry) => {
      if (!w.emphasis || emphScale === 100) return "";
      if (entry && entry.from != null) return `{\\fscx${num((entry.from * emphScale) / 100)}\\fscy${num((entry.from * emphScale) / 100)}\\t(0,${entry.E},\\fscx${num(emphScale)}\\fscy${num(emphScale)})}`;
      return `{\\fscx${num(emphScale)}\\fscy${num(emphScale)}}`;
    };
    const scaleClose = (w, entry) => {
      if (!w.emphasis || emphScale === 100) return "";
      if (entry && entry.from != null) return `{\\fscx${num(entry.from)}\\fscy${num(entry.from)}\\t(0,${entry.E},\\fscx100\\fscy100)}`;
      return "{\\fscx100\\fscy100}";
    };

    // Full cue text; wrap(k, body, word) decorates word k.
    const lineText = (wrap) => {
      let out = "";
      let k = 0;
      lines.forEach((line, li) => {
        if (li) out += "\\N";
        line.forEach((w, wi) => {
          if (wi) out += joiner;
          let raw = upper(w.text);
          let lead = "", trail = "";
          if (wi === 0) { const m = /^ +/.exec(raw); if (m) { lead = "\\h".repeat(m[0].length); raw = raw.slice(m[0].length); } }
          if (wi === line.length - 1) { const m = / +$/.exec(raw); if (m) { trail = "\\h".repeat(m[0].length); raw = raw.slice(0, -m[0].length); } }
          out += lead + wrap(k, renderRuns(fc, raw), w) + trail;
          k++;
        });
      });
      return out;
    };

    const plainWrap = (entry) => (k, body, w) => {
      const c = emphColour && w.emphasis ? [`{\\c${emphColour}}`, `{\\c${prim}}`] : ["", ""];
      return scaleOpen(w, entry) + c[0] + body + c[1] + scaleClose(w, entry);
    };

    if (cueMode === "none") {
      const entry = entryFor(msBetween(f0, f1));
      dlg(0, f0, f1, `{${posTag}${entry.head}}` + lineText(plainWrap(entry)));
      continue;
    }

    if (cueMode === "sweep") {
      const entry = entryFor(msBetween(f0, f1));
      let body = "";
      let k = 0;
      lines.forEach((line, li) => {
        if (li) body += "\\N";
        line.forEach((w, wi) => {
          if (wi) body += joiner;
          const dur = csOf(bound(k)) - csOf(wf[k]);
          body += `{\\kf${Math.max(0, dur)}}` + scaleOpen(w, entry) + renderRuns(fc, upper(w.text)) + scaleClose(w, entry);
          k++;
        });
      });
      dlg(0, f0, f1, `{${posTag}${entry.head}\\1c${hl}\\2c${prim}}` + body);
      continue;
    }

    if (cueMode === "single_word") {
      const lineH = sizePx * (S.font.lineHeight || 1.2);
      const cy = pos.an >= 7 ? Math.round(pos.y + lineH / 2) : pos.an <= 3 ? Math.round(pos.y - lineH / 2) : pos.y;
      let firstShown = true;
      flat.forEach((w, k) => {
        const fa = wf[k], fb = bound(k);
        if (fb <= fa) return;
        const base = w.emphasis ? emphScale : 100;
        const entry = S.entry === "pop" || firstShown ? entryFor(msBetween(fa, fb), base) : { head: "", E: 0, from: null };
        firstShown = false;
        const scaleHead = !entry.head && base !== 100 ? `\\fscx${num(base)}\\fscy${num(base)}` : "";
        const colour = emphColour && w.emphasis ? `\\c${emphColour}` : "";
        dlg(0, fa, fb, `{\\an5\\pos(${pos.x},${cy})${entry.head}${scaleHead}${colour}}` + renderRuns(fc, upper(w.text)));
      });
      continue;
    }

    // Per-word highlight: 'color' (colour, or colour + underline) and 'blob'.
    let firstEvent = true;
    flat.forEach((_, active) => {
      const fa = wf[active], fb = bound(active);
      if (fb <= fa) return;
      const entry = firstEvent ? entryFor(msBetween(fa, fb)) : { head: "", E: 0, from: null };
      firstEvent = false;
      if (cueMode === "color") {
        const underline = S.activeWord === "underline";
        const text = lineText((k, body, w) => {
          if (k !== active) return plainWrap(entry)(k, body, w);
          const open = underline ? `{\\u1\\c${hl}}` : `{\\c${hl}}`;
          const close = underline ? `{\\u0\\c${prim}}` : `{\\c${prim}}`;
          return scaleOpen(w, entry) + open + body + close + scaleClose(w, entry);
        });
        dlg(0, fa, fb, `{${posTag}${entry.head}}` + text);
      } else {
        dlg(0, fa, fb, `{${posTag}${entry.head}}` + lineText(plainWrap(entry)));
        const blob = lineText((k, body, w) => {
          if (k !== active) return scaleOpen(w, entry) + body + scaleClose(w, entry);
          return `{\\alpha&H00&\\3c${hl}\\bord${blobBord}\\blur${num(blobBlur)}}` + scaleOpen(w, entry) + body + scaleClose(w, entry) + "{\\alpha&HFF&}";
        });
        dlg(1, fa, fb, `{${posTag}${entry.head}\\shad0\\alpha&HFF&}` + blob);
      }
    });
  }

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    STYLE_FORMAT,
    styleLine,
    "",
    "[Events]",
    EVENT_FORMAT,
  ];
  const text = `${header.join("\n")}\n${events.length ? `${events.join("\n")}\n` : ""}`;
  const families = [...fc.used];
  const fonts = families.map((f) => fontname.entryForFamily(f).file);
  return {
    text,
    fonts,
    families,
    eventCount: events.length,
    cueCount,
    highlight: mode,
    missingGlyphs: [...fc.missing].sort((a, b) => a - b).map((cp) => cp.toString(16).toUpperCase().padStart(4, "0")),
    assHash: crypto.createHash("sha1").update(text).digest("hex"),
  };
}

// ---- files and filter ------------------------------------------------------------------------
const SAFE_REL_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/;

function checkRel(rel, what) {
  const s = String(rel == null ? "" : rel).replace(/\\/g, "/");
  if (!SAFE_REL_RE.test(s) || s.split("/").some((seg) => seg === ".." || seg === "." || seg === "") || s.length > 200) {
    throw new EditError("PATH_ESCAPE", { status: 400, errorClass: "input", detail: `unsafe ${what} for the ass filter` });
  }
  return s;
}

function burnInArgs({ assRelPath, fontsDirRel = "fonts" } = {}) {
  return `ass=f=${checkRel(assRelPath, "ass path")}:fontsdir=${checkRel(fontsDirRel, "fonts dir")}:shaping=complex`;
}

function assRelPathFor(assHash) {
  if (!/^[0-9a-f]{8,64}$/.test(String(assHash))) throw invalid("bad ass hash");
  return `render/cache/ass/${assHash}.ass`;
}

let tmpSeq = 0;
const verifiedSources = new Set();

function sha256FileSync(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function copyFontsForAss(projectDir, fonts) {
  const destDir = fsx.ensureDir(fsx.resolveInside(projectDir, "fonts"));
  const files = [...new Set((Array.isArray(fonts) ? fonts : []).map(String))];
  const copied = [];
  for (const file of files) {
    const entry = fontname.entryForFile(file);
    if (!entry || entry.file !== file) throw invalid(`font '${file}' is not in the bundled manifest`);
    const src = path.join(fontname.FONTS_DIR_ABS, entry.file);
    const dest = path.join(destDir, entry.file);
    let st = null;
    try { st = fs.statSync(dest); } catch { /* absent */ }
    if (st && st.isFile() && st.size === entry.bytes) continue;
    if (!verifiedSources.has(src)) {
      if (sha256FileSync(src) !== entry.sha256) {
        throw new EditError("FONT_INVALID", { status: 500, errorClass: "config", detail: `bundled font ${entry.file} does not match its manifest sha256` });
      }
      verifiedSources.add(src);
    }
    const tmp = `${dest}.tmp.${process.pid}.${++tmpSeq}`;
    try {
      fs.copyFileSync(src, tmp);
      if (fs.statSync(tmp).size !== entry.bytes) throw invalid(`short copy of ${entry.file}`);
      fsx.renameWithRetrySync(tmp, dest);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch { /* noop */ }
      throw e;
    }
    copied.push(entry.file);
  }
  return { dir: destDir, rel: "fonts", files, copied };
}

function writeAssFile(projectDir, assRelPath, text) {
  const rel = checkRel(assRelPath, "ass path");
  const abs = fsx.resolveInside(projectDir, rel);
  fsx.ensureDir(path.dirname(abs));
  const tmp = `${abs}.tmp.${process.pid}.${++tmpSeq}`;
  try {
    fs.writeFileSync(tmp, String(text), "utf8");
    fsx.renameWithRetrySync(tmp, abs);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
    throw e;
  }
  return abs;
}

module.exports = {
  buildAss, escapeAssText, assTime, burnInArgs, copyFontsForAss, writeAssFile, assRelPathFor,
  fontRuns: (family, text, latinHint) => fontRuns(makeFontContext(family, latinHint), text),
  STYLE_NAME, FPS, WJ,
};
