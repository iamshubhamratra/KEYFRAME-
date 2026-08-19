// Report the AUTHORED length of every long-form bundle.
//
// A long-form pack's authored film is its own clock: the omelette adapter recasts
// the beats' COPY but the bundle's scene list is what the engine plays. If that
// list is shorter than the job's requested duration, the film runs out and the
// last frame holds while the voiceover keeps going — "the video got stuck at
// 2:45". This prints beats, summed dur, and the OM_SCENES payload size (the
// engine hard-caps that string at 16KB and the list at 50 entries).

const fs = require("node:fs");
const path = require("node:path");

const TPL_DIR = path.join(__dirname, "..", "public", "omelette-templates");
const FRAMES_DIR = path.join(__dirname, "..", "..", "frames");

// OM_SCENES is JSON inside a SINGLE-quoted JS string, so its own quotes arrive
// backslash-escaped. Undo exactly that, nothing more.
function readScenes(html) {
  const m = /window\.OM_SCENES\s*=\s*'([\s\S]*?)';/.exec(html);
  if (!m) return null;
  const raw = m[1].replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  try { return { scenes: JSON.parse(raw), bytes: m[1].length }; }
  catch { return { scenes: null, bytes: m[1].length }; }
}

// Which templates are long-form packs (so we only report the ones that matter).
const longform = new Map();
for (const slug of fs.readdirSync(FRAMES_DIR)) {
  const pj = path.join(FRAMES_DIR, slug, "pack.json");
  if (!fs.existsSync(pj)) continue;
  try {
    const m = JSON.parse(fs.readFileSync(pj, "utf8"));
    if (m.longForm && m.template) longform.set(m.template, slug);
  } catch { /* skip */ }
}

const rows = [];
for (const [tpl, slug] of longform) {
  const file = path.join(TPL_DIR, `${tpl}.html`);
  if (!fs.existsSync(file)) { rows.push({ slug, beats: "-", sec: 0, kb: 0, note: "bundle missing" }); continue; }
  const r = readScenes(fs.readFileSync(file, "utf8"));
  if (!r) { rows.push({ slug, beats: "-", sec: 0, kb: 0, note: "no OM_SCENES" }); continue; }
  if (!r.scenes) { rows.push({ slug, beats: "-", sec: 0, kb: +(r.bytes / 1024).toFixed(1), note: "unparseable" }); continue; }
  const sec = r.scenes.reduce((a, s) => a + (Number(s.dur) || 0), 0);
  rows.push({ slug, beats: r.scenes.length, sec: Math.round(sec), kb: +(r.bytes / 1024).toFixed(1), note: "" });
}

rows.sort((a, b) => a.sec - b.sec);
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
console.log("pack".padEnd(18) + "beats".padStart(6) + "authored".padStart(10) + "mm:ss".padStart(8) + "  OM_SCENES");
for (const r of rows) {
  console.log(
    r.slug.padEnd(18) + String(r.beats).padStart(6) + `${r.sec}s`.padStart(10) +
    mmss(r.sec).padStart(8) + `  ${r.kb}KB` + (r.note ? `  ${r.note}` : "")
  );
}
const short = rows.filter((r) => r.sec && r.sec < 280);
console.log(`\n${rows.length} long-form pack(s); ${short.length} author under 280s`);
if (short.length) console.log("under 280s: " + short.map((r) => `${r.slug} (${mmss(r.sec)})`).join(", "));
