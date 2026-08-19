#!/usr/bin/env node
// GEN-FILM-PACKS — write frames/<slug>/pack.json + FRAME.md for every FilmKit pack.
//
// A pack.json is the single machine-readable spec every render path reads (see
// services/frame_manifest.js). Most of it is DERIVED from the skin — colours, fonts,
// orientation, surface, skin accents, and the media slot contract, which comes from the
// real box geometry the beat builders draw. The creative half (vibe, category, tags, audio
// profile, asset hints, FRAME.md prose) is authored per template and lives in
// src/services/film_skins/_metadata.json; anything absent falls back to a derivation so a
// missing metadata file degrades the description, never the render.
//
//   node scripts/gen-film-packs.js            # write all
//   node scripts/gen-film-packs.js --check    # validate only
//   node scripts/gen-film-packs.js ember-roast

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER = path.join(__dirname, "..");
const SKIN_DIR = path.join(SERVER, "src", "services", "film_skins");
// The engine itself, asked for the boxes it draws rather than re-derived here (see `slots` below).
const filmBeats = require(path.join(SERVER, "src", "services", "film_beats"));
const FRAMES = path.join(ROOT, "frames");

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const ONLY = argv.filter((a) => !a.startsWith("--"));

// EVERY SKIN IN THE DIRECTORY, not just the generated kit ones. `_manifest.json` is written
// by gen-film-skins.js and therefore lists only the 70 FilmKit templates; the hand-built
// one-off films are ported straight into film_skins/ and would otherwise ship a composer with
// no pack.json — a renderer nothing can select. Discovering from disk keeps the two families
// on one path.
//
// LAZY, because this module is now also require()d as a library by src/templates/emit.js so a
// generated template's manifest is derived by the SAME function that derives the 89 shipped
// ones. Doing this work at module scope would make a require() read the whole skin directory
// and print to the console.
let _manifest = null;
function loadManifest() {
  if (_manifest) return _manifest;
  const listed = JSON.parse(fs.readFileSync(path.join(SKIN_DIR, "_manifest.json"), "utf8"));
  const known = new Set(listed.map((m) => m.module));
  const extra = fs.readdirSync(SKIN_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_") && !known.has(f))
    .map((f) => {
      const slug = f.replace(/\.js$/, "").replace(/_/g, "-");
      let label = slug;
      try { label = require(path.join(SKIN_DIR, f)).SKIN.label || slug; } catch { /* fall back to the slug */ }
      return { slug, module: f, label };
    });
  if (extra.length) console.log(`[gen-film-packs] +${extra.length} hand-ported film(s): ${extra.map((e) => e.slug).join(", ")}`);
  _manifest = [...listed, ...extra];
  return _manifest;
}
const METAP = path.join(SKIN_DIR, "_metadata.json");
const META = fs.existsSync(METAP) ? JSON.parse(fs.readFileSync(METAP, "utf8")) : {};

const hexToRgb = (h) => {
  h = String(h || "#000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const relLum = (h) => {
  const [r, g, b] = hexToRgb(h).map((v) => v / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// ---- the media contract --------------------------------------------------------
// Real numbers, taken from the boxes services/film_beats.js actually draws against the
// authored 1080x1920. The asset planner sizes its collection budget from this and the
// pre-render gate asks "is the HERO empty?" against it, so a guess here costs real assets.
//
//   NO HOOK SLOT. film-kit.js uses MediaSlot at exactly three sites — the Feature hero card, the
//   Montage tile wall and the CTA logo — and Hook is not one of them, so no reference opener has
//   ever carried a picture. Ours drew one at top:56.25%, in the band where the World draws its own
//   furniture, and it buried the pack's signature scenery on the beat that establishes it.
//   feature    one hero card, 910 x 562 inside the 936 x 588 plate — the CRITICAL box, because it
//              is the reference's own hero, and the pre-render gate needs a real target
//   montage    the 2x2 wall, 455 x 292 per tile, up to 4
//   statement  one grounding card, 936 x 430
//   stats      one dimmed backing plate behind the counters, 1080 x 900
const SLOTS = {
  context: { count: 2, width: 936, height: 430, priority: "medium", objectFit: "cover", kind: "productImages", note: "the statement beat's grounding card" },
  feature: { count: 2, width: 910, height: 562, priority: "critical", objectFit: "cover", kind: "screenshots", note: "the hero media card" },
  how: { count: 4, width: 455, height: 292, priority: "high", objectFit: "cover", kind: "productImages", note: "the 2x2 tile wall" },
  proof: { count: 1, width: 1080, height: 900, priority: "low", objectFit: "cover", kind: "productImages", note: "the dimmed backing plate behind the counters" },
};

// THE SAME CONTRACT, MEASURED AGAINST THE LANDSCAPE STAGE.
//
// A landscape skin lays its beats out ACROSS the 1920x1080 frame (film_beats' WIDE branches), so
// its boxes are different boxes — the hook's device sits beside the copy rather than under it,
// and the montage wall is one row of four rather than a 2x2. These numbers are read off those
// wide layouts exactly as the portrait table above is read off the portrait ones.
//
// Getting this wrong is not cosmetic: the asset planner sizes its whole collection budget from
// these, asset_prep crops to their aspects, and preflight hard-fails when the CRITICAL box comes
// back empty. A portrait table on a landscape pack would collect tall crops for wide boxes.
const SLOTS_WIDE = {
  context: { count: 2, width: 709, height: 562, priority: "medium", objectFit: "cover", kind: "productImages", note: "the statement beat's grounding card, beside the copy" },
  feature: { count: 2, width: 851, height: 528, priority: "critical", objectFit: "cover", kind: "screenshots", note: "the hero media card, leading the row" },
  how: { count: 4, width: 399, height: 475, priority: "high", objectFit: "cover", kind: "productImages", note: "the 1x4 tile row" },
  proof: { count: 1, width: 1920, height: 700, priority: "low", objectFit: "cover", kind: "productImages", note: "the dimmed backing plate behind the counters" },
};

const titleCase = (s) => String(s).replace(/\b[a-z]/g, (c) => c.toUpperCase());

// `metaOverride` lets a caller supply the creative half directly instead of reading it from
// _metadata.json. Used by the admin template generator, whose creative half comes from the
// validated TemplateSpec and has never been written to that file. Absent, behaviour is
// byte-identical to before.
function packFor(m, metaOverride) {
  const mod = require(path.join(SKIN_DIR, m.module));
  const SKIN = mod.SKIN;
  const palette = SKIN.palette({});
  const meta = metaOverride || META[m.slug] || {};
  const ground = palette[SKIN.groundKey];
  const accentHexes = SKIN.accents.map((k) => palette[k]).filter(Boolean);
  const dark = SKIN.dark;

  // colors: the authored roles, with the four the rest of the system reads by name mapped on
  // top so a consumer that asks for "ground"/"text"/"accent" always finds them.
  const colors = { ...palette };
  colors.ground = ground;
  colors.text = palette[dark ? SKIN.paperKey : SKIN.inkKey];
  colors.accent = accentHexes[0] || palette[SKIN.accents[0]] || ground;
  colors.ink = palette[SKIN.inkKey];
  colors.paper = palette[SKIN.paperKey];

  // The skin's AUTHORED stage. Absent on all 89 shipped skins, which is what keeps them portrait.
  const wide = String(SKIN.stage || "portrait") === "landscape";
  const baseSlots = wide ? SLOTS_WIDE : SLOTS;

  // A SKIN MAY DECLARE ITS OWN BOXES — and if it does, the contract must describe THOSE, not the
  // family defaults. film_beats.boxOf resolves the same `SKIN.boxes` fractions when it draws, so
  // deriving the manifest from them here is what keeps the two in step. A manifest that advertised
  // boxes the composer does not draw is precisely the defect that had six shipped packs collecting,
  // vision-scoring and crop-prepping assets for slots no film ever showed.
  //
  // `boxes` is absent on every shipped skin, so `slots` is the unchanged table for all 89 of them.
  // The numbers are NOT recomputed here: film_beats.mediaBoxes runs the same arithmetic its own
  // layouts run, for whichever stage the skin authored, and returns null when nothing is declared.
  // Deriving them a second time in this file is exactly how a manifest starts describing a box no
  // composer draws.
  const slots = (() => {
    const drawn = filmBeats.mediaBoxes(SKIN, wide ? "landscape" : "portrait");
    if (!drawn) return baseSlots;
    const out = JSON.parse(JSON.stringify(baseSlots));
    for (const role of ["feature", "how", "context"]) {
      if (!out[role] || !drawn[role]) continue;
      out[role].width = drawn[role].width;
      out[role].height = drawn[role].height;
    }
    return out;
  })();
  const mechs = Object.keys(SKIN.variants || {});
  const derivedVibe = `${m.label} — a ${wide ? "16:9" : "9:16"} animated ${dark ? "dark" : "light"}-ground film built on a continuously moving hand-drawn world. `
    + `${titleCase(SKIN.display)} display over ${SKIN.body} body, ground ${ground}, accent ${colors.accent}. `
    + `Camera set ${SKIN.cams.join(" / ")} with "${SKIN.titlePreset}" title entrances. `
    + (mechs.length ? `Owns the ${mechs.map((k) => `${k}:${SKIN.variants[k]}`).join(", ")} interaction beat${mechs.length === 1 ? "" : "s"}.` : "");

  return {
    name: m.slug,
    vibe: meta.vibe || derivedVibe,
    orientation: wide ? "landscape" : "portrait",
    category: meta.category || "Animated",
    tags: meta.tags || [SKIN.display, SKIN.body, dark ? "dark" : "light", ...mechs.map((x) => x.toLowerCase())].slice(0, 8),
    renderer: `film-${m.slug}`,
    colors,
    fonts: [...new Set([SKIN.display, SKIN.body, SKIN.mono].filter(Boolean))],
    surface: {
      flat: false,
      lightCinematic: !dark,
      ground,
      // Every beat's `look.<beat>.bg` is its own field, and the source swaps the whole
      // ground per beat — so this family is genuinely alternating, not single-ground. The
      // QA reviewer's identity expectations read this and would otherwise block a correct
      // saturated scene for "the wrong lightness".
      groundMode: "alternating",
    },
    motion: { cut: "push", drift: 1.0 },
    fx: { canvas: "none", three: null },
    skin: { accents: accentHexes, extras: [], emphasisCss: null },
    assets: {
      photoMod: (meta.assets && meta.assets.photoMod) || "",
      iconStyle: (meta.assets && meta.assets.iconStyle) || "line",
      keywords: (meta.assets && meta.assets.keywords) || [],
      prefer: (meta.assets && meta.assets.prefer) || ["screenshot", "photo"],
      // This family's beats render <img> only — a vector handed to it is discarded at the
      // slot, which is how scenes ended up blank on other native packs.
      acceptsVectors: false,
    },
    typography: { display: SKIN.display, body: SKIN.body, ...(SKIN.mono ? { mono: SKIN.mono } : {}) },
    // A `media:false` pack is authored as pure typography — its Feature draws underlined
    // lines, its Montage draws label blocks, and the source's Hook carries no image slot.
    // It renders exactly ONE picture, the CTA logo lockup. Declaring the real contract keeps
    // the asset planner from collecting eight images it will discard, and keeps the portrait
    // guard from reporting a text-led template as an asset failure.
    media: SKIN.media === false
      ? {
        requiredAssets: { screenshots: 0, productImages: 0, logos: 1 },
        placeholders: [],
        slotsByRole: { cta: { count: 1, width: 148, height: 148, priority: "medium", objectFit: "contain", kind: "logos", note: "the CTA logo lockup — this pack is typographic and shows no other imagery" } },
        oversample: 1,
        addressing: "scene",
      }
      : {
        requiredAssets: { screenshots: 3, productImages: 8, logos: 1 },
        placeholders: [],
        slotsByRole: slots,
        oversample: 1.6,
        addressing: "scene",
        // The frame those pixel sizes are measured against, stated only for the landscape
        // stage. frame_manifest.packStage() already infers 1080x1920 from orientation:"portrait",
        // so emitting it for portrait too would be redundant AND would rewrite the `media` block
        // of all 89 shipped packs the next time this script is run — a large diff that changes
        // no behaviour. Landscape says it explicitly because it is the new case.
        ...(wide ? { stage: { width: 1920, height: 1080 } } : {}),
      },
    audio: meta.audio || {
      mood: dark ? "dramatic" : "warm",
      archetype: "editorial",
      energy: "medium",
      tempo: "mid",
      style: ["cinematic", "electronic"],
      musicKeywords: [],
      sfxPalette: { transition: "whoosh", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
      noVo: { energyBoost: 1, sfxDensity: "normal", ambient: true },
    },
  };
}

function frameMd(m, pack, metaOverride) {
  const meta = metaOverride || META[m.slug] || {};
  if (meta.frameMd) {
    return `---\nname: ${m.slug}\nlabel: ${m.label}\norientation: portrait\nfontFamily: ${pack.typography.display}\n---\n\n# ${m.label}\n\n${meta.frameMd}\n`;
  }
  const mod = require(path.join(SKIN_DIR, m.module));
  const SKIN = mod.SKIN;
  const palette = SKIN.palette({});
  const mechs = Object.keys(SKIN.variants || {});
  return `---
name: ${m.slug}
label: ${m.label}
orientation: portrait
fontFamily: ${SKIN.display}
---

# ${m.label}

${pack.vibe}

## Palette

| role | hex |
|---|---|
${Object.entries(palette).map(([k, v]) => `| ${k} | \`${v}\` |`).join("\n")}

Ground \`${SKIN.groundKey}\`, ink \`${SKIN.inkKey}\`, paper \`${SKIN.paperKey}\`.
Brand accents take \`${SKIN.accents.join("`, `")}\` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **${SKIN.display}** (${SKIN.displayFallback}) · body **${SKIN.body}**${SKIN.mono ? ` · mono **${SKIN.mono}**` : ""}.
Headline tracking \`${SKIN.titleSpace}\`, leading \`${SKIN.titleLine}\`, average advance \`${SKIN.em}em\`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set \`${SKIN.cams.join("` · `")}\`, indexed \`i * ${SKIN.camMul} + ${SKIN.camOff}\`.
Title entrance **${SKIN.titlePreset}**, item entrance **${SKIN.itemPreset}**.
World clock runs at \`${SKIN.ambient}x\` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
${mechs.length ? `This pack additionally owns:\n${mechs.map((k) => `- **${k}** (\`${SKIN.variants[k]}\`)`).join("\n")}` : "No interaction beats declared."}

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
`;
}

// ADMIN-GENERATED TEMPLATES ARE NOT THIS SCRIPT'S TO PUBLISH.
//
// The admin template generator writes its skins into the same film_skins/ directory (that is
// the whole point — it is the one registration hook that needs no code edit), so a bulk run of
// this script would discover an unpublished draft and materialise it straight into frames/,
// which is the PUBLISHED root. That would make a template the admin has not approved instantly
// visible in the gallery, auto-selectable by the brief, and eligible to become the rotation
// default. The lifecycle store knows which slugs those are; skip them.
//
// Fail-open on purpose: if the store cannot be read, skip nothing and behave exactly as before
// — this script predates the feature and must keep working without it.
function adminManagedSlugs() {
  try {
    return new Set(require(path.join(SERVER, "src", "templates", "store.js")).unpublishedSlugs());
  } catch { return new Set(); }
}

if (require.main === module) {
  const manifest = loadManifest();
  const skip = adminManagedSlugs();
  let wrote = 0, bad = 0, skipped = 0;
  for (const m of manifest) {
    if (ONLY.length && !ONLY.includes(m.slug)) continue;
    if (skip.has(m.slug)) {
      console.log(`[gen-film-packs] skipping ${m.slug} — an unpublished admin template (publish it through the admin API)`);
      skipped++;
      continue;
    }
    const pack = packFor(m);
    const dir = path.join(FRAMES, m.slug);
    if (CHECK) {
      try {
        const { PackManifestSchema } = require(path.join(SERVER, "src", "services", "frame_manifest.js"));
        PackManifestSchema.parse(pack);
      } catch (e) { console.error(`INVALID ${m.slug}: ${e.message.slice(0, 200)}`); bad++; }
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify(pack, null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(dir, "FRAME.md"), frameMd(m, pack), "utf8");
    wrote++;
  }
  if (CHECK) { console.log(bad ? `${bad} invalid manifest(s)` : "all manifests valid"); process.exit(bad ? 1 : 0); }
  console.log(`wrote ${wrote} pack(s) -> frames/${skipped ? ` (${skipped} admin draft(s) skipped)` : ""}`);

  // The registration block for services/pipeline.js NATIVE_PACK_COMPOSERS.
  const reg = manifest.map((m) => `  "film-${m.slug}": require("./film_skins/${m.module.replace(/\.js$/, "")}"),`).join("\n");
  fs.writeFileSync(path.join(SKIN_DIR, "_register.txt"), reg + "\n", "utf8");
  console.log(`registration block -> src/services/film_skins/_register.txt`);
}

module.exports = { packFor, frameMd, SLOTS, loadManifest };
