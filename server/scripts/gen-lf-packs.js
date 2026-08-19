#!/usr/bin/env node
// GEN-LF-PACKS — write frames/<slug>/pack.json + FRAME.md for every long-form pack.
//
// The sibling of gen-film-packs.js, and the same division of labour: everything MACHINE-READABLE
// is derived from the skin (colours, fonts, camera, stage, the media contract), and everything
// EDITORIAL comes from the handoff's own README table, which already names each film's niche and
// describes its world in the designer's words. Nothing here is invented prose.
//
//   node scripts/gen-lf-packs.js            # write all 27
//   node scripts/gen-lf-packs.js --check    # verify on-disk packs match
//   node scripts/gen-lf-packs.js fetch-club
//
// THE ONE GENUINELY NEW MANIFEST FIELD IS `form`. Phase 0 established that nothing in
// PackManifestSchema distinguishes a 300-second 40-scene pack from a 24-second 6-scene one, and
// that the schema is `.passthrough()` — so an undeclared key rides through and is silently
// ignored by all six listPacks() consumers, including the rotation that picks the DEFAULT pack.
// A long-form pack that is invisible to duration-aware selection is worse than no pack at all:
// it would be chosen for a 30-second brief and render four and a half minutes of held frames.
// So `form` is written here, and frame_manifest/frame_selector are taught to read it in M6.
//
//   "form": { "kind": "longform", "durationSec": 300.5, "sceneCount": 40,
//             "minDurationSec": 240, "maxDurationSec": 360 }
//
// The min/max are the band inside which this pack's authored pacing still reads as designed: the
// spine is a fixed 40-beat arc, so shrinking it below ~6s a beat starts cutting entrances, and
// stretching past ~9s leaves holds the motion was not drawn for.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER = path.join(__dirname, "..");
const SKIN_DIR = path.join(SERVER, "src", "services", "lf_skins");
const FRAMES = path.join(ROOT, "frames");

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const ONLY = argv.filter((a) => !a.startsWith("--"));

const stage = require(path.join(SERVER, "src", "services", "lf_stage"));

// ---- the editorial half, read from the handoff's own README ---------------------
// The table at README.md's "The 28 films" is authored by the designer and names, per film, its
// niche and the world animation behind every scene. Using it keeps the pack description true to
// the film rather than to whatever a generator could infer from six hex values.
function loadReadme() {
  const candidates = [
    process.env.KEYFRAME_LF_HANDOFF || "",
    path.join(ROOT, "templete-design", "longform-handoff"),
    path.join(ROOT, "old-templete", "longform-handoff"),
  ].filter(Boolean);
  for (const dir of candidates) {
    const f = path.join(dir, "README.md");
    if (!fs.existsSync(f)) continue;
    const md = fs.readFileSync(f, "utf8");
    const out = {};
    for (const m of md.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|$/gm)) {
      out[slugify(m[2])] = { film: m[2].trim(), niche: m[3].trim(), world: m[4].trim(), scenes: Number(m[5]) };
    }
    if (Object.keys(out).length) return out;
  }
  return {};
}
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- audio ----------------------------------------------------------------------
// A long-form film is five minutes of text-first kinetic typography with no narration track in
// the handoff, so the bed carries far more of the load than it does in a 24-second short. The
// profile below is deliberately conservative: mid-tempo, medium energy, and a keyword set drawn
// from terms the library's music vocabulary already resolves, because `npm run test:music-vocab`
// fails a pack whose keywords return fewer than three tracks.
//
// NOTE FOR M6: scripts/apply-audio-profiles.js rewrites `manifest.audio` from its own PROFILES
// table or from film_skins/_metadata.json, and `--check` exits 1 on any difference. An lf-* pack
// is in neither source today, so it will report DRIFT until the long-form family is added to that
// script's enumeration. That wiring is tracked as part of M6, not silently worked around here.
const NICHE_AUDIO = {
  default: {
    mood: "unhurried and warm — a long read with a steady pulse under it, never urgent",
    archetype: "documentary", energy: "medium", tempo: "mid",
    style: ["acoustic", "ambient", "folk", "cinematic"],
    musicKeywords: ["acoustic guitar", "warm piano", "soft strings", "gentle percussion",
      "ambient pad", "upright bass", "light marimba", "slow build", "field recording", "calm loop"],
  },
};
function audioFor() {
  const a = NICHE_AUDIO.default;
  return {
    ...a,
    sfxPalette: { transition: "whoosh", ui: "soft-tap", reveal: "light-sweep", data: "counter-tick", cta: "cta-impact" },
    // sfxDensity is normal|rich — not the three-way scale the other energy fields use.
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: true },
  };
}

// ---- the media contract ----------------------------------------------------------
// TWO SLOTS IN FIVE MINUTES, and that is the whole appetite. Measured across all 28 decks: every
// film has exactly one Peek (a 980x540 screenshot card) and one Join (a 140px circular logo).
// Declaring it precisely matters more here than on a short: computeAssetBudget returns 70 assets
// at 300s/40 scenes, so a pack that does not say what it needs will have ~65 stock images fetched
// and CLIP-scored to fill two holes.
function mediaFor(skin, spine) {
  const peek = spine.indexOf("Peek");
  const join = spine.indexOf("Join");
  const placeholders = [];
  if (peek >= 0) {
    placeholders.push({
      role: "feature", kind: "screenshots", sceneIndex: peek, count: 1,
      width: 980, height: 540, priority: "critical", objectFit: "cover",
      note: "the single mid-film media card — the only photographic surface in the whole film",
    });
  }
  if (join >= 0) {
    placeholders.push({
      role: "cta", kind: "logos", sceneIndex: join, count: 1,
      width: 140, height: 140, priority: "medium", objectFit: "cover",
      note: "the circular logo slot in the closing card; the lockup drops entirely when absent",
    });
  }
  return {
    stage: { width: stage.RW, height: stage.RH },
    requiredAssets: { screenshots: 1, productImages: 0, logos: 1, illustrations: 0, icons: 0 },
    maxAssets: 3,
    oversample: 1,
    placeholders,
    slotsByRole: {},
  };
}

// ---- derive ----------------------------------------------------------------------
function packFor(skin, meta) {
  const S = skin.SKIN;
  const P = S.palette({});
  const spine = stage.resolveSpine(S);
  const durationSec = Number(S.spineOverrides && spine.length ? 0 : 0) || spineDuration(spine);
  const info = meta || {};

  const worldPhrase = info.world ? info.world.charAt(0).toLowerCase() + info.world.slice(1) : "a hand-drawn animated backdrop";
  const vibe = `${info.niche ? `${info.niche}. ` : ""}A five-minute text-first film: forty kinetic-typography beats in `
    + `${S.display} over ${S.body}, on ${P.paper} paper with ${P.accent} and ${P.accent2} accents, alternating with two `
    + `tinted grounds so no two consecutive scenes share a field. Behind every beat runs one continuous world — `
    + `${worldPhrase} — with a per-scene camera drawn from ${JSON.stringify(S.cams)} at stride ${S.camStride}. `
    + `Exactly one screenshot and one logo appear in the whole run; everything else is type and hand-authored SVG.`;

  return {
    name: S.id,
    vibe,
    orientation: "landscape",
    category: "Long-form",
    tags: ["long-form", "five-minute", "kinetic-typography", "text-first", "landscape",
      ...(info.niche ? info.niche.toLowerCase().split(/\s*\/\s*/).map((s) => s.trim()) : [])].filter(Boolean),
    renderer: `lf-${S.id}`,
    colors: {
      paper: P.paper, ink: P.ink, accent: P.accent, accent2: P.accent2,
      sageT: P.sageT, terraT: P.terraT, ground: P.paper, text: P.ink, desk: S.desk,
    },
    fonts: [S.display, S.body],
    surface: { flat: true, lightCinematic: false, ground: P.paper, groundMode: "alternating" },
    motion: { cut: "cut", drift: 1 },
    fx: { canvas: "none", three: null },
    skin: { accents: [P.accent, P.accent2], extras: [], emphasisCss: null },
    assets: {
      photoMod: "One screenshot only, shown whole on a cream card with a soft drop shadow and a "
        + "degree or two of rotation — never cropped into, never dimmed. The film is typographic; "
        + "the single image is a window, not a texture.",
      iconStyle: "none",
      keywords: info.niche ? info.niche.toLowerCase().split(/\s*\/\s*/).map((s) => s.trim()) : [],
      prefer: ["screenshot", "photo"],
      acceptsVectors: false,
    },
    typography: { display: S.display, body: S.body, mono: null },
    media: mediaFor(S, spine),
    audio: audioFor(),
    // THE NEW CAPABILITY FIELD — see the header.
    form: {
      kind: "longform",
      durationSec,
      sceneCount: spine.length,
      minDurationSec: 240,
      maxDurationSec: 360,
    },
  };
}

// Every authored deck runs 7.5s a beat with an 8s closer; the 41-scene films add one more beat.
// Derived rather than hardcoded so a re-run tracks a changed spine.
function spineDuration(spine) {
  return Number((spine.length * 7.5 + 0.5).toFixed(2));
}

function frameMd(pack, S, info) {
  const P = S.palette({});
  return `---
name: ${pack.name}
label: ${S.label}
orientation: landscape
form: longform
fontFamily: ${S.display}
---

# ${S.label}

${info && info.niche ? `${info.niche}. ` : ""}A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | \`${P.paper}\` | the default ground |
| ink | \`${P.ink}\` | all type |
| accent | \`${P.accent}\` | kickers, rules, emphasis — brandable |
| accent2 | \`${P.accent2}\` | the second voice — brandable |
| sageT | \`${P.sageT}\` | tinted ground A, alternating |
| terraT | \`${P.terraT}\` | tinted ground B, alternating |
| desk | \`${S.desk}\` | outside the frame |

## Type

Display **${S.display}**, body **${S.body}**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from \`${JSON.stringify(S.cams)}\` at stride ${S.camStride}/${S.camOff}, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier ${S.ambient}.

## World

${info && info.world ? info.world : "A hand-authored animated SVG world"} — computed from the clock,
running under every beat, hidden (never stopped) on the ${countWorldOff()} scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: ${'`'}media.maxAssets${'`'} is 3. Everything else on screen is type and inline SVG.
`;
}

function countWorldOff() {
  const { META } = require(path.join(SERVER, "src", "services", "lf_beats"));
  return Object.values(META).filter((m) => m.world === false).length;
}

// ---- main -------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(SKIN_DIR)) { console.error(`no lf_skins directory — run scripts/gen-lf-skins.js first`); process.exit(1); }
  const readme = loadReadme();
  const files = fs.readdirSync(SKIN_DIR).filter((f) => f.endsWith(".js"));
  let written = 0, drift = 0, skipped = 0;

  for (const f of files) {
    const skin = require(path.join(SKIN_DIR, f));
    const slug = skin.SKIN.id;
    if (ONLY.length && !ONLY.includes(slug)) { skipped++; continue; }
    const info = readme[slug] || null;
    const pack = packFor(skin, info);
    const md = frameMd(pack, skin.SKIN, info);

    const dir = path.join(FRAMES, slug);
    const packPath = path.join(dir, "pack.json");
    const mdPath = path.join(dir, "FRAME.md");
    const packBody = JSON.stringify(pack, null, 2) + "\n";

    if (CHECK) {
      const curPack = fs.existsSync(packPath) ? fs.readFileSync(packPath, "utf8") : "";
      const curMd = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
      if (curPack !== packBody) { console.error(`DRIFT ${slug}/pack.json`); drift++; }
      if (curMd !== md) { console.error(`DRIFT ${slug}/FRAME.md`); drift++; }
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(packPath, packBody, "utf8");
    fs.writeFileSync(mdPath, md, "utf8");
    written++;
  }

  if (CHECK) {
    console.log(drift ? `${drift} long-form pack file(s) drifted` : `all long-form packs match their skins`);
    process.exit(drift ? 1 : 0);
  }
  console.log(`[lf-packs] wrote ${written} pack(s) -> frames/${skipped ? ` (${skipped} skipped)` : ""}`);
  console.log(`[lf-packs] NOTE: these are PUBLISHED the moment they land in frames/ — six listPacks() consumers see them at once.`);
}

main();
