// PACK-MEDIA GUARD — a pack's shop window must show the pack it advertises.
//
// WHY THIS EXISTS. `/api/frames` gives the picker a `posterUrl` and a `previewUrl` per pack. All 46
// packs had both, so nothing looked wrong — but **33 of the 46 posters were OLDER than the composer
// they claim to show**, and ten of those packs had no composer at all until the day this was written.
// Their previews advertised a design the renderer could not produce.
//
// Nothing could have caught it. The files exist, the route resolves, the JSON is well-formed, and the
// picker renders a perfectly good card. The only thing wrong is that the card is out of date, and
// nothing in the suite knew what "out of date" meant for a poster.
//
// WHAT IT CHECKS, per pack:
//   1. poster.jpg and preview.mp4 exist.
//   2. Neither is older than the pack's composer. A composer edit changes what the pack renders, so
//      the media it renders into is stale by definition until regenerated.
//   3. The poster's orientation matches the manifest's. A landscape card for a 9:16 pack is a
//      letterboxed lie about the shape of the film the user will get.
//   4. The poster is not a near-black frame, and not so small it must be a solid colour.
//   5. The preview is a plausible size: big enough to be a real clip, small enough for a grid.
//
// Fix a failure with:  node scripts/make-pack-media.js --stale
//
// Run: npm run test:pack-media

const fs = require("node:fs");
const path = require("node:path");

const frameRegistry = require("../src/services/frame_registry");
const fm = require("../src/services/frame_manifest");

const PUBLIC_FRAMES = path.join(__dirname, "..", "public", "frames");

// A poster under this is either a solid fill or a near-black frame; both read as a broken card.
const MIN_POSTER_BYTES = 4 * 1024;
// A preview under this cannot be 8 seconds of anything; over it is too heavy for a picker grid that
// autoplays several at once.
const MIN_PREVIEW_BYTES = 24 * 1024;
const MAX_PREVIEW_BYTES = 1600 * 1024;

// JPEG dimensions from the SOF marker — no image library needed for a width and a height.
function jpegSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xFF) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function composerFileFor(pack) {
  const renderer = String((fm.getManifest(pack) || {}).renderer || "");
  if (!renderer) return null;
  const guess = path.join(__dirname, "..", "src", "services", `${renderer.replace(/-/g, "_")}_composer.js`);
  return fs.existsSync(guess) ? guess : null;
}

function main() {
  const packs = frameRegistry.listPacks();
  console.log(`\nPACK-MEDIA GUARD — ${packs.length} pack(s)\n`);

  const problems = [];
  for (const pack of packs) {
    const manifest = fm.getManifest(pack) || {};
    const portrait = /portrait/i.test(String(manifest.orientation || ""));
    const poster = path.join(PUBLIC_FRAMES, pack, "poster.jpg");
    const preview = path.join(PUBLIC_FRAMES, pack, "preview.mp4");
    const say = (msg) => problems.push({ pack, msg });

    if (!fs.existsSync(poster)) { say("no poster.jpg — the picker card will have no image"); continue; }
    if (!fs.existsSync(preview)) { say("no preview.mp4 — the picker card cannot play"); continue; }

    const pStat = fs.statSync(poster), vStat = fs.statSync(preview);

    const composer = composerFileFor(pack);
    if (composer) {
      const cT = fs.statSync(composer).mtimeMs;
      if (cT > pStat.mtimeMs || cT > vStat.mtimeMs) {
        say(`media predates its composer (${path.basename(composer)}) — it advertises a design the pack no longer renders`);
      }
    }

    if (pStat.size < MIN_POSTER_BYTES) say(`poster is only ${Math.round(pStat.size / 1024)}kb — probably a flat or near-black frame`);
    if (vStat.size < MIN_PREVIEW_BYTES) say(`preview is only ${Math.round(vStat.size / 1024)}kb — too small to be a real clip`);
    if (vStat.size > MAX_PREVIEW_BYTES) say(`preview is ${Math.round(vStat.size / 1024)}kb — too heavy for a picker grid (cap ${MAX_PREVIEW_BYTES / 1024}kb)`);

    const size = jpegSize(poster);
    if (!size) say("poster is not a readable JPEG");
    else if ((size.height > size.width) !== portrait) {
      say(`poster is ${size.width}x${size.height} but the manifest says ${portrait ? "portrait" : "landscape"}`);
    }
  }

  const byPack = new Map();
  for (const p of problems) byPack.set(p.pack, [...(byPack.get(p.pack) || []), p.msg]);
  for (const [pack, msgs] of byPack) {
    console.log(`  ✗ ${pack}`);
    for (const m of msgs) console.log(`      ${m}`);
  }
  if (!byPack.size) console.log("  ✓ every pack's poster and preview exist, match its shape, and are newer than its composer");

  console.log(`\n${packs.length - byPack.size} passed, ${byPack.size} failed  (${packs.length} pack(s) checked)`);
  if (byPack.size) console.log(`\nRegenerate with:  node scripts/make-pack-media.js --stale\n`);
  process.exit(byPack.size ? 1 : 0);
}

if (require.main === module) main();
