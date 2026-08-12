// SIDE-BY-SIDE CONTACT SHEET — stitch a pack's frames against its reference's, scene by scene.
//
// scripts/shot-reference.js and scripts/shot-pack.js already shoot both halves at the same beats
// into framecheck/ref/<Template>/ and framecheck/ours/<pack>/ with matching filenames. What did
// not exist was any way to SEE them together: TEMPLATE-FIDELITY-STATUS.md §1 ends with "Open them
// side by side", which means twelve file-manager windows per template and a comparison held in
// short-term memory. That is precisely the friction that let a library be "ported" while losing
// its atmosphere — the check existed and was too expensive to run.
//
// This writes ONE image per template: reference left, ours right, one row per scene, each row
// labelled with the scene name. A divergence that takes paragraphs to describe is a glance here.
//
// Usage:
//   node scripts/framecheck-sheet.js fetch --ref Fetch
//   node scripts/framecheck-sheet.js all                  # every pack with both halves on disk
//   node scripts/framecheck-sheet.js deep --ref Deep --width 1100
//
// Output: framecheck/sheets/<pack>.png

const fs = require("node:fs");
const path = require("node:path");

let sharp;
try { sharp = require("sharp"); }
catch (e) {
  console.error(`framecheck-sheet needs sharp: ${e.message}`);
  process.exit(2);
}

const FRAMECHECK = path.join(__dirname, "..", "framecheck");
const REF_DIR = path.join(FRAMECHECK, "ref");
const OURS_DIR = path.join(FRAMECHECK, "ours");
const OUT_DIR = path.join(FRAMECHECK, "sheets");

// pack -> reference template. Only packs ported FROM a handoff appear; the rest have no reference
// to be measured against. Kept beside the harnesses rather than derived from a filename, for the
// same reason pipeline.js keeps DEDICATED_COMPOSERS: a naming convention is not a contract, and
// `teampulse` is ported from `Stomp`, which no rule could guess.
const PACK_TO_REF = {
  deep: "Deep",
  drive: "Drive",
  edition: "Edition",
  fetch: "Fetch",
  fight: "Fight",
  flight: "Flight",
  "flight-vertical": "FlightVertical",
  hacker: "Hacker",
  jungle: "Jungle",
  momentum: "Momentum",
  orbit: "Orbit",
  pipeline: "Pipeline",
  reel: "Reel",
  showcase: "Showcase",
  "showcase-vertical": "ShowcaseVertical",
  teampulse: "Stomp",
};

// A capture filename is "<prefix>-t<seconds>-<SceneName>.png". The prefix differs by side
// (Template vs pack), so the JOIN KEY is everything after the first hyphen.
function indexFrames(dir) {
  const out = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")); }
  catch { return out; }
  for (const f of files) {
    const i = f.indexOf("-t");
    if (i < 0) continue;
    out.set(f.slice(i + 1, -4), path.join(dir, f));   // "t8_25-Run"
  }
  return out;
}

function labelSvg(text, w, h, { size = 22, bg = "#111418", fg = "#E8EDF2" } = {}) {
  const esc = String(text).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${w}" height="${h}" fill="${bg}"/>` +
    `<text x="14" y="${Math.round(h * 0.68)}" font-family="Consolas,monospace" font-size="${size}" fill="${fg}">${esc}</text>` +
    `</svg>`
  );
}

async function buildSheet(pack, tpl, opts) {
  const refFrames = indexFrames(path.join(REF_DIR, tpl));
  const ourFrames = indexFrames(path.join(OURS_DIR, pack));
  if (!refFrames.size) return { pack, ok: false, error: `no reference frames in framecheck/ref/${tpl}` };
  if (!ourFrames.size) return { pack, ok: false, error: `no pack frames in framecheck/ours/${pack}` };

  // Rows in capture order (the key encodes the seek time, so sorting by the numeric seconds
  // keeps scenes in film order rather than lexical order — t8_25 must not sort after t13_75).
  const secondsOf = (k) => Number(String(k).slice(1).split("-")[0].replace("_", ".")) || 0;
  const keys = [...refFrames.keys()].sort((a, b) => secondsOf(a) - secondsOf(b));

  // A 9:16 frame is 3.16x taller per unit of width than a 16:9 one, so a portrait pack stitched at
  // the landscape width produces a 10,000px column nobody scrolls through — the same "technically
  // available, practically unopenable" failure this tool exists to remove. Portrait halves its
  // width unless the caller states one.
  const first = await sharp(refFrames.get(keys[0])).metadata();
  const portrait = first.height > first.width;
  const HALF = Math.max(320, Number(opts.width) || (portrait ? 460 : 900));
  const LABEL_H = 34;
  const GAP = 8;

  const rows = [];
  for (const k of keys) {
    const refPath = refFrames.get(k);
    const ourPath = ourFrames.get(k);
    // A scene present in the reference and absent from ours is itself the finding — draw the row
    // with an explicit MISSING panel rather than dropping it, so a lost beat cannot hide as a
    // shorter sheet. (fetch shipped without its Run scene for exactly this long.)
    const refImg = sharp(refPath).resize({ width: HALF, withoutEnlargement: false });
    const refMeta = await sharp(refPath).metadata();
    const h = Math.round((refMeta.height / refMeta.width) * HALF);

    const left = await refImg.png().toBuffer();
    let right;
    if (ourPath) {
      right = await sharp(ourPath).resize({ width: HALF, height: h, fit: "contain", background: "#1A1D22" }).png().toBuffer();
    } else {
      right = await sharp({ create: { width: HALF, height: h, channels: 3, background: "#2A1418" } })
        .composite([{ input: labelSvg("MISSING — this beat has no frame in our capture", HALF, 40, { bg: "#2A1418", fg: "#FF8A8A" }), top: Math.round(h / 2) - 20, left: 0 }])
        .png().toBuffer();
    }

    rows.push({ key: k, h, left, right });
  }

  const totalW = HALF * 2 + GAP;
  const totalH = LABEL_H + rows.reduce((a, r) => a + LABEL_H + r.h + GAP, 0);

  const composites = [];
  composites.push({ input: labelSvg(`REFERENCE: ${tpl}   ·   OURS: ${pack}`, totalW, LABEL_H, { size: 20, bg: "#05070A", fg: "#7FE7D6" }), top: 0, left: 0 });
  let y = LABEL_H;
  for (const row of rows) {
    composites.push({ input: labelSvg(`${row.key}          ◀ reference                                    ours ▶`, totalW, LABEL_H, { size: 18 }), top: y, left: 0 });
    y += LABEL_H;
    composites.push({ input: row.left, top: y, left: 0 });
    composites.push({ input: row.right, top: y, left: HALF + GAP });
    y += row.h + GAP;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${pack}.png`);
  await sharp({ create: { width: totalW, height: totalH, channels: 3, background: "#05070A" } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const missing = rows.filter((r) => !ourFrames.get(r.key)).length;
  return { pack, ok: true, outPath, scenes: rows.length, missing, size: totalW + "x" + totalH };
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ref") opts.ref = argv[++i];
    else if (a === "--width") opts.width = Number(argv[++i]);
    else if (a.startsWith("--")) { console.error(`unknown flag ${a}`); process.exit(2); }
    else positional.push(a);
  }

  const target = positional[0];
  if (!target) {
    console.error("usage: node scripts/framecheck-sheet.js <pack|all> [--ref <Template>] [--width 900]");
    process.exit(2);
  }

  const jobs = target === "all"
    ? Object.entries(PACK_TO_REF).map(([pack, tpl]) => ({ pack, tpl }))
    : [{ pack: target, tpl: opts.ref || PACK_TO_REF[target] }];

  let ok = 0;
  for (const j of jobs) {
    if (!j.tpl) { console.warn(`[sheet] ${j.pack}: no reference template known — pass --ref`); continue; }
    try {
      const res = await buildSheet(j.pack, j.tpl, opts);
      if (res.ok) {
        ok++;
        console.log(`[sheet] ${j.pack} … ${res.scenes} scene(s)${res.missing ? `, ${res.missing} MISSING` : ""}, ${res.size} -> ${path.relative(path.join(__dirname, ".."), res.outPath)}`);
      } else {
        console.warn(`[sheet] ${j.pack}: ${res.error}`);
      }
    } catch (e) {
      console.warn(`[sheet] ${j.pack} failed: ${e.message}`);
    }
  }
  console.log(`\n[sheet] ${ok}/${jobs.length} written`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { buildSheet, PACK_TO_REF };
