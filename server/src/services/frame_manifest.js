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

    // The aspect the pack was AUTHORED against. Omit for an aspect-agnostic pack (the
    // scene-kit packs, which lay out through services/responsive.js and adapt to any frame).
    //
    // This is load-bearing, not documentation. A portrait composer measures vertical
    // POSITION as a fraction of height and every HEIGHT as a fraction of width (cqw is the
    // only definite unit inside an auto-height parent) — the two are calibrated against each
    // other at the authored 1080x1920 and nowhere else. Render the same markup at 1920x1080
    // and heights inflate while the room for them contracts: measured on organic-garden, the
    // hook's device frame runs 99.2cqw deep in a 56.3cqw-tall frame, overflowing by 76%.
    //
    // 22 packs carried this key while it sat outside the schema and nothing in the selection
    // path read it, so the mismatch had no guard at all. See frameSelectorAgent.
    orientation: z.enum(["portrait", "landscape", "square"]).optional(),

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
        // Does `ground` describe the WHOLE film, or only one of the fields it uses?
        // "single" (the default, and true of every pack that does not say otherwise) —
        // one ground for the film. "alternating" — the pack deliberately swaps between
        // that ground and full-frame saturated accent fields, so a saturated scene is
        // correct rather than a mis-grounding. Read by the QA reviewer's identity
        // expectations, which otherwise blocks a correct scene for "the wrong lightness".
        groundMode: z.enum(["single", "alternating"]).default("single"),
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
        // Can this pack's composer actually RENDER an SVG/vector in a scene slot?
        // Optional override for packAcceptsVectors() — omit and the renderer decides
        // (scene-kit yes, dedicated native composers no). See the note by that
        // function: fetching vectors a composer will discard leaves scenes blank.
        acceptsVectors: z.boolean().optional(),
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

    // Per-pack BRAND CONTRACT — what a brand color may steer on this pack. Consumed by
    // brand_kit.resolveBrand (mode/slots/maxAccents/contrastFloor/hueDriftMax). Absent or
    // mode:"accents" is today's accent-only behavior (so this validates every existing
    // pack.json unchanged); mode:"atmosphere" additionally rotates the pack's GROUND hue
    // toward the brand with luminance pinned (flagship/brightlife only); mode:"off" opts a
    // pack out entirely (e.g. bauhaus — its primary triad IS the movement).
    brand: z
      .object({
        mode: z.enum(["off", "accent", "accents", "atmosphere"]).default("accents"),
        slots: z.array(z.any()).default([]),       // role names (string) or {role,from,minRatio}
        maxAccents: z.number().default(3),
        contrastFloor: z.number().default(3.0),    // WCAG ratio vs surface.ground — PER PACK
        hueDriftMax: z.number().default(40),        // degrees a brand hue may travel — PER PACK
        note: z.string().default(""),
      })
      .default({}),

    // Per-pack AUDIO IDENTITY — the pack's sound, declared the same way its look is.
    // Consumed by services/audio_profile.profileFor, which steers the music search and
    // biases the SFX palette. Absent (or empty) = NEUTRAL = exactly today's behaviour:
    // the query falls back to the script's subject-derived mood/query and every cue
    // resolves through audio_cues.intentFor alone. That default is what let this land
    // pack-by-pack without touching the packs that had not been written yet.
    //
    // `sfxPalette` values MUST name a real audio_cues.CUES intent — validateAll() below
    // rejects anything else at boot, loudly, rather than letting a typo degrade silently
    // in the middle of a render.
    audio: z
      .object({
        mood: z.string().default(""),
        energy: z.enum(["low", "medium", "high"]).default("medium"),
        tempo: z.enum(["slow", "mid", "fast"]).default("mid"),
        // Genre tags — used to score candidate tracks against the pack's identity.
        style: z.array(z.string()).default([]),
        // Which shared flavour pool this pack draws from (tech / luxury / editorial /
        // hype / warm / retro / corporate / groove). Authored in
        // scripts/apply-audio-profiles.js and written here for provenance: an archetype
        // widens a pack's COLOUR vocabulary and never its genre, so packs that share one
        // still search differently. Absent on a pack that predates the grouping.
        archetype: z.string().default(""),
        // The actual search phrases, authored CALMEST-FIRST: with narration off the
        // rotation prefers the later entries, which is how "more energetic without a
        // genre change" is implemented. 10 per pack — 6 hand-authored, plus the
        // archetype's two calmer and two more driving words at either end.
        musicKeywords: z.array(z.string()).default([]),
        // Scene function -> the cue that function sounds like ON THIS PACK.
        sfxPalette: z.record(z.string()).default({}),
        // How this pack behaves with narration off. energyBoost 0 opts out of the
        // tilt entirely (a pack that should stay exactly as calm with no voice).
        noVo: z
          .object({
            energyBoost: z.number().min(0).max(2).default(1),
            sfxDensity: z.enum(["normal", "rich"]).default("rich"),
            ambient: z.boolean().default(false),
          })
          .default({}),
      })
      .default({}),

    // Per-pack MEDIA CONTRACT — how many pictures this template can show, and the shape
    // and importance of each box it shows them in. Consumed by services/template_media,
    // which resolves it against the approved script into concrete placeholders; those then
    // drive the collection quota (graph.assetPlannerAgent), the crop aspects
    // (graph.assetPrepAgent), the placement priorities (asset_reuse.buildSlots) and the
    // pre-render gate (preflight's criticalPlaceholdersFilled).
    //
    // ABSENT = DERIVED, which is exactly today's behaviour: template_media falls back to a
    // conservative one-slot-per-showable-scene plan sized from the renderer family, and the
    // duration budget alone decides how much to collect. That default is what let this land
    // pack-by-pack without touching the 46 packs that have not been authored yet.
    //
    // The schema lives in template_media (it is that module's contract, not this one's) and
    // is required lazily so a frames-only tool can still load this module standalone. Kept
    // permissive here — `.passthrough()` above already preserves it, and template_media
    // re-validates and degrades to a derived plan on anything malformed, so a typo costs a
    // pack its authored slots and never a film its render.
    media: z.record(z.any()).optional(),

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
  let withAudio = 0, withMedia = 0;
  for (const name of packs) {
    const p = manifestPath(name);
    let exists = false;
    try { exists = !!(p && fs.statSync(p)); } catch { exists = false; }
    if (!exists) { missing.push(name); continue; }
    // Force a fresh validate (bypass cache) so a bad file is always reported.
    try {
      const m = PackManifestSchema.parse(JSON.parse(fs.readFileSync(p, "utf8")));
      // AUDIO PALETTE — zod can only assert "a record of strings". Whether those strings
      // name a sound this system can actually PRODUCE is a cross-module question, and the
      // only place it can be answered cheaply is here, at boot. A pack naming a cue the
      // library cannot resolve would otherwise fall back silently mid-render — the exact
      // class of failure this manifest exists to make loud.
      const badCues = audioPaletteErrors(m.audio);
      if (badCues.length) throw new Error(`audio.sfxPalette: ${badCues.join("; ")}`);
      if (m.audio && (m.audio.musicKeywords || []).length) withAudio++;
      // MEDIA CONTRACT — same reasoning as the audio palette above: zod can only assert
      // "a record of anything" at this layer, because the real shape belongs to
      // template_media. Validate it against that module's own schema HERE, at boot, so a
      // malformed slot list is reported loudly against the pack that owns it rather than
      // silently degrading to a derived plan in the middle of a render.
      const badMedia = mediaErrors(m.media);
      if (badMedia) throw new Error(`media: ${badMedia}`);
      if (m.media) withMedia++;
      valid.push(name);
    } catch (err) {
      invalid.push({ name, error: err && err.message ? String(err.message).split("\n")[0] : String(err) });
    }
  }
  console.log(`[manifest] ${valid.length}/${packs.length} packs have a valid pack.json` +
    (missing.length ? ` · ${missing.length} legacy-only (no manifest)` : "") +
    (invalid.length ? ` · ${invalid.length} INVALID` : "") +
    ` · ${withAudio} with an audio identity` +
    ` · ${withMedia} with a media contract`);
  for (const { name, error } of invalid) console.error(`[manifest] INVALID ${name}/pack.json — ${error}`);
  return { valid, missing, invalid, withAudio, withMedia };
}

// The first schema error in a pack's media block, or null when it is absent or valid.
// Required lazily for the same reason audioPaletteErrors is: template_media reaches back
// into asset_reuse (and therefore config), and a frames-only tool must still be able to
// load this module standalone.
function mediaErrors(media) {
  if (!media) return null;
  try {
    const { MediaSchema } = require("./template_media");
    MediaSchema.parse(media);
    return null;
  } catch (e) {
    if (e && e.name === "ZodError") return String(e.message).split("\n").slice(0, 3).join(" ").slice(0, 240);
    return null;   // can't check (module unavailable) => don't block a boot on it
  }
}

// Which sfxPalette entries name something the cue library cannot produce. Returns [] for
// an absent/empty block, so a pack with no audio identity is never reported as broken.
// Required lazily: audio_cues spawns ffmpeg at call time but not at require time, and
// keeping the dependency lazy means a frames-only tool can load this module standalone.
function audioPaletteErrors(audio) {
  if (!audio || !audio.sfxPalette) return [];
  let CUES, PALETTE_ROLES;
  try {
    ({ CUES } = require("./audio_cues"));
    ({ PALETTE_ROLES } = require("./audio_profile"));
  } catch { return []; }   // can't check => don't block a boot on it
  const errs = [];
  for (const [role, cue] of Object.entries(audio.sfxPalette)) {
    if (!PALETTE_ROLES.includes(role)) {
      errs.push(`unknown scene role "${role}" (expected ${PALETTE_ROLES.join(" | ")})`);
      continue;
    }
    // null is a deliberate "this pack has no ambient layer" — absence, not a typo.
    if (cue == null || cue === "") continue;
    if (!CUES[cue]) errs.push(`"${role}" names cue "${cue}", which is not in audio_cues.CUES`);
  }
  return errs;
}

// ---------------------------------------------------------------------------
// RENDER CAPABILITY — what a pack's composer can actually put on screen.
//
// WHY: the asset planner used to guarantee that EVERY scene pulled an icon/vector
// ("so the composer always has real graphic material to layer"). But every one of
// the 21 dedicated native composers opens its asset gate with
//     if (/\.svg($|\?)/i.test(a.path)) return false;
// because an arbitrary Iconify glyph stretched into a billboard/plate looks broken.
// So the planner spent a third of its budget fetching assets the chosen composer
// was guaranteed to discard, and the scenes those vectors were meant to fill
// rendered an empty placeholder instead. In the audited 30s film that was 5 of 9
// assets dead on arrival and 3 of 7 scenes showing a blank grey panel.
//
// The fix is to make the capability EXPLICIT and let the planner ask for what the
// pack can use. Only the deterministic scene-kit has real vector treatments
// (scene_kit partitions assets into photo/vector buckets and art-directs each);
// dedicated renderers are photographic. A pack can override via
// `pack.json → assets.acceptsVectors`.
const VECTOR_CAPABLE_RENDERERS = new Set([
  "", "scene-kit", "kit", // no dedicated renderer => the scene-kit path
]);

function packAcceptsVectors(pack) {
  try {
    const m = getManifest(pack);
    if (m && m.assets && typeof m.assets.acceptsVectors === "boolean") return m.assets.acceptsVectors;
    const renderer = (m && m.renderer) || "";
    return VECTOR_CAPABLE_RENDERERS.has(String(renderer));
  } catch {
    return true; // fail-open: unknown pack keeps the historical behaviour
  }
}

// The aspect a pack was authored against, or null when it declared none (aspect-agnostic —
// it lays out through services/responsive.js and adapts to whatever frame it is given).
function packOrientation(pack) {
  try { const m = getManifest(pack); return (m && m.orientation) || null; }
  catch { return null; }
}

// The job orientations the pipeline emits, expressed as the manifest's vocabulary.
// config.orientations: horizontal(16:9) | vertical(9:16) | square(1:1).
const JOB_ASPECT = { horizontal: "landscape", vertical: "portrait", square: "square" };

// THE FRAME A PACK'S OWN NUMBERS ARE MEASURED AGAINST.
//
// Every slot in `media.slotsByRole` is an AUTHORED pixel size — the box as the composer draws
// it on the stage that composer states once (`om_port_kit.stageOf(W, H)`, film_stage's
// RW/RH = 1080x1920). Those numbers are meaningless without the frame they were measured
// against, and every consumer that treated them as pixels of the DELIVERED frame has been
// wrong twice over: wrong by the resolution (the same pack scored 2.25x the coverage at 720p
// as at 1080p) and wrong by the aspect (a 1920x1080-authored box scored ~3.2x its true share
// of a 1080x1920 frame).
//
// Declared `media.stage` wins; otherwise the authored orientation implies it. A pack that
// declares neither returns null and its callers keep their previous behaviour — an unknown
// stage must not be guessed, because guessing it wrong is the defect this exists to close.
const STAGE_FOR = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};
function packStage(pack) {
  try {
    const m = getManifest(pack);
    const s = m && m.media && m.media.stage;
    if (s && Number(s.width) > 0 && Number(s.height) > 0) {
      return { width: Number(s.width), height: Number(s.height) };
    }
    const o = (m && m.orientation) || null;
    return (o && STAGE_FOR[o]) ? { ...STAGE_FOR[o] } : null;
  } catch { return null; }
}

// Can `pack` serve a job rendered at this orientation?
//
// An undeclared pack is compatible with everything — that is what "aspect-agnostic" means,
// and it keeps every scene-kit pack behaving exactly as it always has. A pack that DID
// declare an aspect only serves that aspect, with one deliberate exception: a square job is
// close enough to either authored aspect to be served by both (responsive.aspectMode treats
// 0.86..1.2 as its own mode and the composers already branch on it), so squares are never
// starved of choices.
function packFitsOrientation(pack, jobOrientation) {
  const authored = packOrientation(pack);
  if (!authored) return true;
  const want = JOB_ASPECT[String(jobOrientation || "")] || null;
  if (!want) return true;              // unknown orientation — never block on it
  if (want === "square") return true;
  return authored === want;
}

module.exports = {
  PackManifestSchema, getManifest, listManifests, manifestPath, validateAll,
  packAcceptsVectors, packOrientation, packFitsOrientation, packStage, audioPaletteErrors, mediaErrors,
};
