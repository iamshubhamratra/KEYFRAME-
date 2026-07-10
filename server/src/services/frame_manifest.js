// PACK MANIFEST — the single machine-readable spec for a frame pack (Phase 3).
//
// Today a pack's identity is smeared across ~5 hand-maintained tables in 3+
// files (scene_kit FLAT_PACKS / LIGHT_GRADIENT_PACKS / PACK_SKINS / PACK_MOTION /
// fxModeFor, pack_style PACK_STYLE, brief PACK_VIBES, web packlore PACK_LORE) plus
// FRAME.md frontmatter. Adding a pack means editing ~13 sites; only 4 of 14 packs
// have deep identity. This module introduces ONE source of truth: a validated
// `frames/<pack>/pack.json` that every render path can eventually read from.
//
// FOUNDATION STAGE (this change): additive + read-through only. The loader parses
// and zod-validates the manifest; NOTHING in the render hot path consumes it yet.
// The manifests are a FAITHFUL extraction of the current live tables (see the
// bootstrap generator), so wiring consumers in later increments preserves behavior
// exactly. Fail-soft: a missing or invalid manifest returns null and callers keep
// their existing table-driven behavior.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const frameRegistry = require("./frame_registry");

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #RRGGBB");

// The schema mirrors what the current tables actually hold, with a few optional
// forward-looking fields (typography detail, layout, camera3d) reserved for later
// phases. `.passthrough()` keeps unknown keys so a richer future manifest never
// fails an older loader. Every field has a safe default so a minimal
// `{ "name": "x" }` manifest still validates.
const PackManifestSchema = z
  .object({
    name: z.string().min(1),
    // One-line human "vibe" used for tone->pack matching (brief PACK_VIBES today).
    vibe: z.string().default(""),

    // Authored color roles from FRAME.md — name -> #RRGGBB. Order is authored law.
    colors: z.record(HEX).default({}),
    // Distinct font families the pack declares (FRAME.md fontFamily). The first
    // non-safe family is the display face; used later to fix the typography eraser.
    fonts: z.array(z.string()).default([]),

    // Ground/gradient character. Stored as raw set-membership (NOT the derived
    // ground color) so consumers recompute exactly as today:
    //   gradients = !flat ;  lightGround = flat || lightCinematic
    surface: z
      .object({
        flat: z.boolean().default(false), // FLAT_PACKS — solid fills, no gradients/glows
        lightCinematic: z.boolean().default(false), // LIGHT_GRADIENT_PACKS — light base, keeps gradients
        // Authored ground color (Phase 3). When set, scene_kit uses it directly
        // instead of deriving light/dark from flat/lightCinematic + luminance —
        // which mis-grounded light packs (bloom, mono) onto their dark ink token
        // and dark packs (noir) onto their lightest token.
        ground: HEX.optional(),
      })
      .default({}),

    // Editorial cut + camera drift grammar (scene_kit PACK_MOTION).
    motion: z
      .object({
        cut: z.string().default("glow"),
        drift: z.number().default(1.05),
      })
      .default({}),

    // Background FX: the 2D canvas painter mode (scene_kit fxModeFor) + optional
    // WebGL signature scene (PACK_SKINS.three: constellation | shards | paper | ...).
    fx: z
      .object({
        canvas: z.string().default("bokeh"),
        three: z.string().nullable().default(null),
      })
      .default({}),

    // Deep skin: pinned accent order + ornament hues + signature emphasis CSS
    // (scene_kit PACK_SKINS). Empty for the packs that currently have no skin.
    skin: z
      .object({
        accents: z.array(HEX).default([]),
        extras: z.array(HEX).default([]),
        emphasisCss: z.string().nullable().default(null),
      })
      .default({}),

    // Asset discovery/scoring bias (pack_style PACK_STYLE).
    assets: z
      .object({
        photoMod: z.string().default(""),
        iconStyle: z.string().default("line"),
        keywords: z.array(z.string()).default([]),
        // Media-type preference for split-art (Phase 6): first-listed leads.
        // e.g. ["photo","vector"] = a photo-forward pack; default (empty) keeps
        // the vector-first behavior. Values: photo | illustration | vector.
        prefer: z.array(z.string()).default([]),
      })
      .default({}),

    // Per-pack TEXT ANIMATION + typographic treatment (the anti-sameness layer).
    // Before this, every pack shared ONE headline animation (wordsIn: blur-up) and
    // the text layout rotated by seed, not by pack — so packs differed only in
    // color + font. `textfx` lets each pack pick a distinct headline entrance, a
    // distinct emphasis effect, and its own display case/tracking/weight/size/align.
    // Every field defaults to the legacy look, so a pack with no textfx block
    // renders exactly as before (blur-up / gradient emphasis / seed-rotated layout).
    textfx: z
      .object({
        // Headline word/char entrance. word-level: blur-up | slide | spring |
        // mask-reveal | line-wipe | drift ; char-level: typewriter | char-pop | glitch
        enter: z.string().default("blur-up"),
        // Emphasized-word treatment: gradient | glow | boxed | marker |
        // underline-grow | bracket
        emphasis: z.string().default("gradient"),
        case: z.string().default("none"),        // none | upper — display case
        tracking: z.number().default(0),          // display letter-spacing (em)
        weight: z.number().nullable().default(null), // display weight override
        sizeScale: z.number().default(1),         // headline size multiplier (~0.85–1.15)
        align: z.string().default("rotate"),      // left | center | right | rotate (seed)
      })
      .default({}),

    // Per-pack SONIC identity — the template's BGM lane + a curated SFX palette.
    // Steers the audio planner (system_audio) so a pack carries its own sound
    // instead of the planner improvising from scratch, and gives a deterministic
    // BGM fallback if the planner returns no music. Every field defaults empty, so
    // a pack with no audio block behaves exactly as before (planner-only).
    audio: z
      .object({
        music: z
          .object({
            query: z.string().default(""),   // royalty-free search phrase for the bed
            mood: z.string().default(""),     // upbeat|energetic|cinematic|… (system_audio moods)
            volume: z.number().default(0.16), // bed level under VO
          })
          .default({}),
        sfx: z
          .object({
            style: z.string().default(""),          // one-line character of the SFX set
            palette: z.array(z.string()).default([]), // preferred SFX search phrases
          })
          .default({}),
      })
      .default({}),

    // --- Reserved for later Phase 3/4 population (kept optional, unpopulated). ---
    typography: z.record(z.any()).optional(),
    layout: z.record(z.any()).optional(),
    camera3d: z.record(z.any()).optional(),
  })
  .passthrough();

function manifestPath(name) {
  return frameRegistry.FRAMES_DIR ? path.join(frameRegistry.FRAMES_DIR, name, "pack.json") : null;
}

/** @type {Map<string, {manifest: object|null, mtimeMs: number}>} */
const cache = new Map();

// Load + validate a pack's manifest. mtime-cached (like getFrameMd) so edits are
// picked up without a restart. Returns null (and warns once per bad state) when
// the file is absent or fails validation — callers must degrade to legacy tables.
function getManifest(name) {
  const p = name && manifestPath(name);
  if (!p) return null;
  let st;
  try {
    st = fs.statSync(p);
  } catch {
    return null; // no pack.json for this pack — caller uses legacy tables
  }
  const hit = cache.get(name);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.manifest;

  let manifest = null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    manifest = PackManifestSchema.parse(raw);
  } catch (err) {
    console.warn(`[manifest] ${name}/pack.json invalid, ignoring: ${err && err.message ? err.message : err}`);
    manifest = null;
  }
  cache.set(name, { manifest, mtimeMs: st.mtimeMs });
  return manifest;
}

// All packs that currently ship a valid manifest.
function listManifests() {
  return frameRegistry.listPacks().filter((n) => getManifest(n) != null);
}

// Boot health-check (Phase 5): validate every installed pack's manifest and log a
// summary, so a pack.json that's present-but-invalid fails LOUDLY at startup
// instead of silently degrading to legacy tables mid-render. Never throws — the
// server still boots (fail-soft), but the operator sees the bad pack immediately.
function validateAll() {
  const packs = frameRegistry.listPacks();
  const valid = [], missing = [], invalid = [];
  for (const name of packs) {
    const p = manifestPath(name);
    let exists = false;
    try { exists = !!(p && fs.statSync(p)); } catch { exists = false; }
    if (!exists) { missing.push(name); continue; }
    // Force a fresh validate (bypass cache) so a bad file is always reported.
    try {
      PackManifestSchema.parse(JSON.parse(fs.readFileSync(p, "utf8")));
      valid.push(name);
    } catch (err) {
      invalid.push({ name, error: err && err.message ? String(err.message).split("\n")[0] : String(err) });
    }
  }
  console.log(`[manifest] ${valid.length}/${packs.length} packs have a valid pack.json` +
    (missing.length ? ` · ${missing.length} legacy-only (no manifest)` : "") +
    (invalid.length ? ` · ${invalid.length} INVALID` : ""));
  for (const { name, error } of invalid) console.error(`[manifest] INVALID ${name}/pack.json — ${error}`);
  return { valid, missing, invalid };
}

module.exports = { PackManifestSchema, getManifest, listManifests, manifestPath, validateAll };
