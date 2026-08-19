// IMPORT THE LONG-FORM HANDOFF — 28 five-minute 16:9 kinetic-typography films.
//
// The handoff ships each film as a self-contained `standalone/<slug>.html`: a
// __bundler page whose `__bundler/manifest` block holds every resource (engine,
// kit, per-film identity, four woff2 faces) as base64 gzip keyed by UUID. The
// omelette renderer already knows how to drive that shape, so a film needs no
// composer of its own — it becomes a frame pack that names its bundle.
//
// EXACTLY ONE EDIT IS REQUIRED, and it is not cosmetic. The engine's SceneStage
// reserves room for its on-screen scrubber:
//
//     const barH = 44; // playback bar height
//     const s = Math.min(el.clientWidth / width, (el.clientHeight - barH) / height);
//
// A browser preview wants that. A RENDER does not: hyperframes captures the full
// 1920x1080 stage, so 44 reserved pixels scale the film down and leave a band of
// desk colour along the bottom of every frame of every film. Setting it to 0 is
// what the shipped Field Notes bundle does — diffing the shipped bundle against
// its handoff twin shows a single differing resource, differing by a single
// character. This script reproduces that edit rather than re-deriving it, so
// every one of the 28 is imported the way the proven one was.
//
// Everything else (pack.json, FRAME.md) is generated from the film's OWN
// identity — the palette/fonts it declares in engine/lf-pack-N.js — rather than
// hand-transcribed, so a pack can never drift from the film it renders.
//
//   node scripts/import-longform-handoff.js --src <longform-handoff dir> [--force] [--only slug]
//
// Idempotent: an existing pack is skipped unless --force.

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const FORCE = argv.includes("--force");
const ONLY = argOf("only", null);
const SRC = argOf("src", null);
if (!SRC) { console.error("usage: node scripts/import-longform-handoff.js --src <longform-handoff dir>"); process.exit(1); }

const ROOT = path.resolve(__dirname, "..", "..");           // repo root
const FRAMES_DIR = path.join(ROOT, "frames");
const TPL_DIR = path.join(ROOT, "server", "public", "omelette-templates");

// Per-film editorial metadata, transcribed from the handoff README's own table.
// The palette, fonts and brand come from the film's code; only the things code
// cannot state — what the film is ABOUT, and therefore what stock imagery and
// music suit it — live here.
const NICHE = {
  "fetch-club":      { niche: "dogs / off-leash club", world: "trotting dog with cycling legs, bouncing ball, paw prints", kw: ["dog", "puppy", "park", "pet", "walk", "ball"], bgm: "bright playful acoustic, hand claps, sunny", energy: "upbeat", photo: "warm natural light, candid outdoor pets" },
  "nine-lives":      { niche: "cats", world: "breathing cat, twitching ear, unspooling yarn, dust motes", kw: ["cat", "kitten", "pet", "yarn", "window", "nap"], bgm: "soft plucked strings, unhurried, cosy", energy: "calm", photo: "soft window light, cosy interior" },
  "knife-and-board": { niche: "cooking / prep", world: "chopping knife, flying herbs, simmering pot with steam", kw: ["cooking", "kitchen", "food", "chef", "herbs", "knife"], bgm: "warm rhythmic acoustic, kitchen energy", energy: "medium", photo: "warm kitchen light, rustic food styling" },
  "lunch-hour":      { niche: "office lunch / workplace", world: "sweeping clock, bento grid filling, queue of dots", kw: ["office", "lunch", "desk", "bento", "team", "break"], bgm: "clean modern indie pop, light percussion", energy: "upbeat" , photo: "bright modern workplace, clean editorial"},
  "ship-log":        { niche: "dev tooling / CI", world: "commit graph drawing, terminal typing, packets on a wire", kw: ["code", "terminal", "developer", "server", "pipeline", "software"], bgm: "minimal electronic, steady pulse, technical", energy: "medium", photo: "dark technical workspace, screens and code" },
  "split-times":     { niche: "running", world: "bobbing runner, curved track, live split readout", kw: ["running", "track", "athlete", "race", "training", "sport"], bgm: "driving electronic, insistent tempo", energy: "high", photo: "high-contrast sports photography, motion" },
  "dawn-chorus":     { niche: "birdwatching", world: "birds flapping on sine paths, four on a wire, rising sun", kw: ["bird", "nature", "dawn", "forest", "wildlife", "sky"], bgm: "gentle ambient folk, airy, spacious", energy: "calm", photo: "soft dawn light, nature photography" },
  "canopy":          { niche: "rainforest / ecology", world: "swaying leaf layers, light shafts, drips, hanging vine", kw: ["rainforest", "jungle", "leaf", "canopy", "green", "nature"], bgm: "lush ambient pads, organic percussion", energy: "calm", photo: "deep green foliage, dappled light" },
  "ledger-and-lift": { niche: "personal finance", world: "candlestick chart building, tilting card, rising coins", kw: ["finance", "money", "savings", "chart", "budget", "invest"], bgm: "confident minimal piano, forward motion", energy: "medium", photo: "clean editorial finance, considered still life" },
  "tide-table":      { niche: "coast / sea swimming", world: "four wave layers, spinning parasol, gulls, sun glare", kw: ["sea", "coast", "swim", "beach", "wave", "tide"], bgm: "breezy surf guitar, open and bright", energy: "medium", photo: "coastal daylight, open water" },
  "hive-mind":       { niche: "beekeeping", world: "comb cells filling, bees on figure-eights, smoker", kw: ["bee", "honey", "hive", "apiary", "flower", "pollen"], bgm: "warm folk with gentle drone, golden", energy: "calm", photo: "golden hour, warm honey tones" },
  "wheel-and-spoke": { niche: "cycling", world: "two spinning spoked wheels, road dashes, climb profile", kw: ["cycling", "bike", "road", "ride", "wheel", "sport"], bgm: "rolling indie rock, steady cadence", energy: "medium", photo: "open road, dynamic outdoor sport" },
  "loft-notes":      { niche: "vinyl / record collecting", world: "spinning platter, tracking tonearm, EQ bars, sleeve rack", kw: ["vinyl", "record", "music", "turntable", "audio", "sleeve"], bgm: "warm dusty soul groove, vinyl crackle", energy: "medium", photo: "warm interior, analogue textures" },
  "kiln-fire":       { niche: "ceramics / pottery", world: "wobbling wheel with rising pot, glowing kiln, bending cone", kw: ["pottery", "ceramic", "clay", "kiln", "craft", "studio"], bgm: "earthy acoustic, patient, handmade", energy: "calm", photo: "studio craft light, clay and hands" },
  "night-shift":     { niche: "24h bakery / night city", world: "windows lighting at random, delivery van, sweeping clock", kw: ["night", "bakery", "city", "bread", "neon", "shift"], bgm: "late-night lo-fi, warm keys, quiet city", energy: "calm", photo: "night city light, warm windows" },
  "allotment":       { niche: "vegetable plot", world: "rows of seedlings growing, watering can, hopping robin", kw: ["garden", "vegetable", "allotment", "grow", "soil", "harvest"], bgm: "gentle fingerpicked folk, unhurried", energy: "calm", photo: "soft daylight, garden and soil" },
  "slow-pour":       { niche: "coffee", world: "spiralling pour, blooming bubbles, drips, live scale", kw: ["coffee", "brew", "cafe", "pour", "beans", "barista"], bgm: "mellow jazz-adjacent keys, café warmth", energy: "calm", photo: "warm café light, close craft detail" },
  "chalk-and-crimp": { niche: "climbing", world: "holds popping in sequence, chalk puff, swinging rope", kw: ["climbing", "boulder", "chalk", "rock", "route", "grip"], bgm: "taut percussive rock, building tension", energy: "high", photo: "textured rock, dramatic directional light" },
  "stitch-line":     { niche: "sewing / making", world: "bobbing needle, feeding stitch line, pattern pieces, tape", kw: ["sewing", "fabric", "stitch", "pattern", "textile", "craft"], bgm: "light acoustic with rhythmic pulse", energy: "medium", photo: "bright craft table, fabric texture" },
  "blitz-hour":      { niche: "chess", world: "knight hopping L-moves, fast clock with falling flag", kw: ["chess", "board", "strategy", "clock", "game", "tournament"], bgm: "tense minimal strings, ticking pulse", energy: "medium", photo: "high-contrast tabletop, dramatic shadow" },
  "safelight":       { niche: "darkroom photography", world: "pulsing red bulb, swaying negatives, tray ripples", kw: ["darkroom", "film", "photography", "negative", "print", "analog"], bgm: "moody ambient, red-lit and patient", energy: "calm", photo: "deep shadow, single-source red light" },
  "reef-tank":       { niche: "marine aquarium", world: "fish schooling in a glass box, swaying anemones, bubbles", kw: ["aquarium", "reef", "fish", "coral", "tank", "marine"], bgm: "shimmering ambient, submerged and slow", energy: "calm", photo: "blue aquatic light, vivid coral colour" },
  "branch-line":     { niche: "steam railway", world: "loco crossing with steam, semaphore arm, telegraph poles", kw: ["railway", "steam", "train", "track", "station", "heritage"], bgm: "nostalgic brass-tinged folk, rolling", energy: "medium", photo: "heritage railway, steam and iron" },
  "steep-and-steam": { niche: "tea house", world: "pouring kettle arc, steam curls, leaves unfurling, timer", kw: ["tea", "teapot", "leaves", "brew", "ceremony", "steam"], bgm: "quiet koto-tinged ambient, meditative", energy: "calm", photo: "soft steam, muted ceramic tones" },
  "rope-and-round":  { niche: "boxing gym", world: "swinging heavy bag, skipping-rope arc, ring ropes, bell", kw: ["boxing", "gym", "training", "ring", "gloves", "fight"], bgm: "hard-hitting percussive hip-hop, gritty", energy: "high", photo: "gritty gym light, hard shadow" },
  "field-of-view":   { niche: "astronomy", world: "twinkling stars, constellation drawing, rotating dome, meteors", kw: ["astronomy", "stars", "night sky", "telescope", "space", "galaxy"], bgm: "wide cinematic ambient, cosmic and still", energy: "calm", photo: "night sky, deep space imagery" },
  "grain-line":      { niche: "hand woodwork", world: "plane throwing shavings, sawdust, dovetails cutting, clamps", kw: ["woodwork", "timber", "workshop", "tools", "craft", "joinery"], bgm: "warm acoustic with woody percussion", energy: "medium", photo: "workshop light, timber grain and tools" },
};

const relLum = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return 1;
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};

/** Load every film identity by RUNNING the packs against stubs — the palette is
 *  a function of the tweak object, so it has to be called, not parsed. */
function loadIdentities(engineDir) {
  const cfgs = [];
  const g = globalThis;
  const prevReact = g.React, prevKit = g.LFKit;
  g.React = { createElement: () => null };
  g.LFKit = { rgba: () => "", make: (c) => cfgs.push(c) };
  try {
    for (const f of fs.readdirSync(engineDir).filter((x) => /^lf-pack-\d+\.js$/.test(x)).sort()) {
      // eslint-disable-next-line no-eval
      eval(fs.readFileSync(path.join(engineDir, f), "utf8"));
    }
  } finally { g.React = prevReact; g.LFKit = prevKit; }
  const fam = (s) => { const m = /"([^"]+)"/.exec(String(s || "")); return m ? m[1] : String(s || "").split(",")[0].trim(); };
  return cfgs.map((c) => {
    const p = c.palette ? c.palette({}) : {};
    return {
      global: c.global, brand: c.brand, desk: c.desk,
      display: fam(c.FH), body: fam(c.FB),
      paper: p.paper, ink: p.ink, accent: p.accent, accent2: c.accent2Opts?.[0] || p.accent2,
      sageT: p.sageT, terraT: p.terraT,
      tags: c.tags || [],
    };
  });
}

/** The one edit. Returns the rewritten page, or throws if the bundle does not
 *  look like what we think it is — a silent no-op here would ship 27 films with
 *  a black band along the bottom of every frame. */
function stripPlaybackBar(html) {
  const re = /<script type="__bundler\/manifest">([\s\S]*?)<\/script>/;
  const m = re.exec(html);
  if (!m) throw new Error("no __bundler/manifest block — not a handoff bundle");
  const manifest = JSON.parse(m[1]);
  let edited = 0;
  for (const [key, res] of Object.entries(manifest)) {
    if (!res || !res.data || !res.compressed) continue;
    let text;
    try { text = zlib.gunzipSync(Buffer.from(res.data, "base64")).toString("utf8"); }
    catch { continue; }                                    // fonts / binaries
    if (!text.includes("const barH = 44;")) continue;
    const next = text.replace(/const barH = 44;/g, "const barH = 0;");
    manifest[key] = { ...res, data: zlib.gzipSync(Buffer.from(next, "utf8"), { level: 9 }).toString("base64") };
    edited++;
  }
  if (edited !== 1) throw new Error(`expected exactly 1 resource carrying the playback bar, found ${edited}`);
  return html.slice(0, m.index) + `<script type="__bundler/manifest">${JSON.stringify(manifest)}</script>` + html.slice(m.index + m[0].length);
}

function packJson(id, meta, sceneCount) {
  const light = relLum(id.paper) > 0.5;
  return {
    name: id.slug,
    renderer: "omelette",
    template: id.global,
    portraitNative: false,
    longForm: true,
    longFormOk: true,
    vibe: `long-form 16:9 kinetic-typography film for ${meta.niche} — ${sceneCount} authored beats, ~7.5s each, about 5 minutes as shipped. ${meta.world}. ${id.display} display over ${id.body} body; per-scene garnish layer (corner tags, footnotes, side labels, doodles) so no frame reads empty. Text-first: two image slots in the whole film.`,
    colors: { ground: id.paper, ink: id.ink, accent: id.accent, a2: id.accent2 },
    fonts: [id.display, id.body],
    surface: { flat: true, lightCinematic: light, ground: id.paper, ink: id.ink },
    motion: { cut: "panel", drift: 1 },
    fx: { canvas: "none", three: null },
    typography: { display: id.display, body: id.body, case: "mixed" },
    audio: { bgm: meta.bgm, energy: meta.energy },
    skin: {
      accents: [id.accent, id.accent2],
      extras: [id.sageT, id.terraT, id.ink].filter(Boolean),
      emphasisCss: `color:${id.accent};`,
    },
    assets: { photoMod: meta.photo, iconStyle: "outline", keywords: meta.kw, prefer: ["photo", "screenshot"] },
    camera3d: { ground: id.paper },
    layout: { propFill: false, kicker: true, underline: true, stat: "inline", assetStyle: "plain" },
    textfx: { enter: "rise", emphasis: "accent", case: "mixed", tracking: 0, weight: null, sizeScale: 1, align: "left" },
  };
}

function frameMd(id, meta, sceneCount) {
  return `# ${id.brand} — long-form kinetic-typography film (16:9)

A ~5-minute, ${sceneCount}-beat looping film for ${meta.niche}, rendered from its own
original bundle — only the words and the two pictures change. Built for LONG-FORM
video: every beat is a different type animation (~7.5s each), so a 2–5 minute
script never repeats a layout.

## Design system
- Paper \`${id.paper}\`, ink \`${id.ink}\`, accent \`${id.accent}\`, second accent
  \`${id.accent2}\`, tinted grounds \`${id.sageT}\` / \`${id.terraT}\`.
- **${id.display}** display over **${id.body}** body (bundled in the standalone).
- Brand mark top-left; per-scene garnish layer — rotating corner tag, italic
  footnote, vertical side label or spinning doodle — so no frame reads empty.
- Animated SVG world behind every scene: ${meta.world}.

## Shape vocabulary (${sceneCount} authored beats)
Drawn from the kit's 60 scene renderers with no name repeating inside the film —
letter-level (Open, Rain, Spiral, Wave…), word-level (Problem, Marker, Magnet…),
line/block (Wilt, Curtain, Cards…), data (Counts, Ladder, Gauge, Plans…) and the
bookends (Kit chapter cards, Peek image card, QA, Join CTA). Slot keys include
kicker/title/sub/lines/steps/stats/items/words/pairs/rows/q&a/plans — text-first;
\`image\` appears twice (a mid-film setup card and the CTA logo).

## Casting notes
- 16:9 only (\`portraitNative: false\`); it is a LONG FORM gallery entry
  (\`longForm: true\`) and must not be rerouted to scene-kit past 75s
  (\`longFormOk: true\` — honoured per-pack by the pipeline).
- Copy law: \`title\` is the primary slot (kit convention) — the adapter maps it
  from the beat's own line.
- The engine caps the scene list at 50 entries and the serialized scenes string
  at 16KB; the adapter's \`__kfplate__\` sentinel keeps the branded fill plate out
  of that budget.
`;
}

// ---- run ----
const engineDir = path.join(SRC, "engine");
const standaloneDir = path.join(SRC, "standalone");
for (const d of [engineDir, standaloneDir]) {
  if (!fs.existsSync(d)) { console.error(`missing ${d}`); process.exit(1); }
}

const norm = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const slugify = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const identities = loadIdentities(engineDir);
const byNorm = new Map(identities.map((c) => [norm(c.brand), c]));

const files = fs.readdirSync(standaloneDir).filter((f) => f.endsWith(".html")).sort();
fs.mkdirSync(TPL_DIR, { recursive: true });

const done = [], skipped = [], failed = [];
for (const file of files) {
  const base = file.replace(/\.html$/, "");
  if (ONLY && base !== ONLY) continue;
  // An already-installed pack is skipped BEFORE the identity lookup: Field Notes
  // ships from the pre-kit `field-notes-film.jsx` and so has no LFKit.make()
  // entry, which would otherwise be reported as a failure on every run.
  if (fs.existsSync(path.join(FRAMES_DIR, base, "pack.json")) && !FORCE) { skipped.push(base); continue; }
  const id = byNorm.get(norm(base));
  if (!id) { failed.push([base, "no identity in engine/lf-pack-*.js"]); continue; }
  id.slug = slugify(id.brand);

  const meta = NICHE[id.slug];
  if (!meta) { failed.push([id.slug, "no editorial metadata (add it to NICHE)"]); continue; }

  const packDir = path.join(FRAMES_DIR, id.slug);
  if (fs.existsSync(path.join(packDir, "pack.json")) && !FORCE) { skipped.push(id.slug); continue; }

  try {
    const html = fs.readFileSync(path.join(standaloneDir, file), "utf8");
    const out = stripPlaybackBar(html);
    fs.writeFileSync(path.join(TPL_DIR, `${id.global}.html`), out, "utf8");

    // Beat count comes from the film itself (OM_SCENES), not from a table.
    let sceneCount = 40;
    const om = /window\.OM_SCENES\s*=\s*'([\s\S]*?)';/.exec(html);
    if (om) { try { sceneCount = JSON.parse(om[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\")).length || 40; } catch { /* keep default */ } }

    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(packJson(id, meta, sceneCount), null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(packDir, "FRAME.md"), frameMd(id, meta, sceneCount), "utf8");
    done.push(`${id.slug} -> ${id.global}.html (${sceneCount} beats)`);
  } catch (e) {
    failed.push([id.slug, e.message]);
  }
}

console.log(`\nimported ${done.length}:`);
for (const d of done) console.log("  " + d);
if (skipped.length) console.log(`\nskipped ${skipped.length} (already present; --force to overwrite): ${skipped.join(", ")}`);
if (failed.length) { console.log(`\nFAILED ${failed.length}:`); for (const [s, why] of failed) console.log(`  ${s}: ${why}`); }
process.exit(failed.length ? 1 : 0);
