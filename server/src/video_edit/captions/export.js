// VIDEO EDIT SUBTITLE EXPORT — output-timeline cues -> <rid>.srt + <rid>.vtt (RENDER.md §6 "Export").
//
// WHY THIS EXISTS. The burnt-in captions and the downloadable subtitles must say the same thing at the
// same time, so both come from the same placed cues (never re-derived from the transcript). The text
// formatting itself is the app's existing SRT/VTT writer (services/captions.js toSrt/toVtt) so every
// export in the product looks alike. What this adds is what a player needs and those helpers assume:
// cues sorted and non-overlapping (players drop or stack overlapping cues), no blank lines inside a cue
// (a blank line ends an SRT/VTT block), WebVTT entity escaping (& < > are markup in VTT), no "-->"
// inside cue text, and an atomic write so a concurrent download never sees half a file.
//
// CONTRACT:
//   subCuesFrom(cues) -> [{ start, end, text }]   hidden / collapsed / empty cues dropped; sorted; each
//     cue ends no later than the next one starts (≥ 1 ms long); text = lines.join('\n') (sentence case).
//   writeSubs(cues, dir, base) -> { srt, vtt, count }   absolute paths of <dir>/<base>.srt|.vtt
//     base: [A-Za-z0-9_.-]{1,80}; throws EditError SUBS_INVALID_NAME (input) otherwise.

const fs = require("node:fs");
const path = require("node:path");
const { toSrt, toVtt } = require("../../services/captions");
const { EditError } = require("../errors");
const fsx = require("../fsx");

const MIN_SEC = 0.001;

function cleanLines(cue) {
  const src = Array.isArray(cue.lines) && cue.lines.length ? cue.lines : [cue.text == null ? "" : cue.text];
  return src
    .flatMap((l) => String(l == null ? "" : l).split(/\r?\n/))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function subCuesFrom(cues) {
  const list = (Array.isArray(cues) ? cues : [])
    .filter((c) => c && !c.hidden && c.resolved && !c.resolved.collapsed
      && Number.isFinite(c.resolved.outIn) && Number.isFinite(c.resolved.outOut) && c.resolved.outOut > c.resolved.outIn)
    .map((c) => ({ start: Math.max(0, c.resolved.outIn), end: c.resolved.outOut, lines: cleanLines(c) }))
    .filter((c) => c.lines.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (let k = 0; k < list.length; k++) {
    const c = list[k];
    const next = list[k + 1];
    const end = next ? Math.min(c.end, next.start) : c.end;
    if (end - c.start < MIN_SEC) continue;
    out.push({ start: c.start, end, text: c.lines.join("\n") });
  }
  return out;
}

const vttEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let tmpSeq = 0;
function writeAtomic(file, text) {
  const tmp = `${file}.tmp.${process.pid}.${++tmpSeq}`;
  try {
    fs.writeFileSync(tmp, text, "utf8");
    fsx.renameWithRetrySync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
    throw e;
  }
  return file;
}

function writeSubs(cues, dir, base) {
  const name = String(base == null ? "" : base);
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name) || name.startsWith(".") || name.includes("..")) {
    throw new EditError("SUBS_INVALID_NAME", { status: 400, errorClass: "input", detail: "subtitle base name must be [A-Za-z0-9_.-]{1,80}" });
  }
  const subs = subCuesFrom(cues);
  const target = fsx.ensureDir(path.resolve(dir));
  const srt = writeAtomic(path.join(target, `${name}.srt`), toSrt(subs.map((c) => ({ ...c, text: c.text.replace(/-->/g, "->") }))));
  const vtt = writeAtomic(path.join(target, `${name}.vtt`), toVtt(subs.map((c) => ({ ...c, text: vttEscape(c.text) }))));
  return { srt, vtt, count: subs.length };
}

module.exports = { writeSubs, subCuesFrom };
