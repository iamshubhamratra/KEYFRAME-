// TEMPLATE GENERATOR (admin pipeline) — turns an admin's brief into a real,
// schema-valid frame pack (pack.json + FRAME.md) inside the STAGING directory.
//
// WHY THE MODEL EMITS A SPEC AND NOT SOURCE. A frame pack's FRAME.md is injected
// verbatim into the composer prompt and its pack.json drives the renderer, so
// letting an LLM author either one is letting it author what this server then
// executes. It doesn't need to: scripts/new-pack.js already crosses a FAMILY
// (the hand-built structural DNA — surface, motion, FX, textfx, scene grammar)
// with a VARIANT (palette + fonts + name) to emit both files. The model's whole
// job is that VARIANT object: eleven fields of colours, font names and prose.
// Everything structural comes from code that shipped with the repo.
//
// WHY THE VARIANT IS REBUILT FIELD BY FIELD, NEVER SPREAD. The reply is data
// from an untrusted author. buildVariantFromSpec() constructs a fresh object out
// of individually validated values, so a key the model invents (emphasisCss,
// assets.photoMod, textfx) is DROPPED rather than merged into the manifest — the
// only CSS a generated pack can carry is the gradient this file synthesizes from
// two already-validated hex values.
//
// WHY IT NEVER THROWS FOR A MODEL FAILURE. The caller drives a state machine
// (GENERATING -> GENERATED | FAILED). A throw mid-generation would strand the
// template in GENERATING with nothing to show the admin, so every model, parse
// and validation failure comes back as { ok: false, error } for
// setStatus(FAILED, { error }). Nothing lands on disk until the manifest has
// passed PackManifestSchema, and nothing is ever written outside the staging
// directory (§21) — those two are fail-CLOSED.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");
const { PackManifestSchema, listManifests, getManifest } = require("./frame_manifest");
const { buildPack, FAMILIES } = require("../../scripts/new-pack");
const { FONT_FACES, isBundled } = require("../fonts/pack_fonts");
const store = require("../admin/template_store");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_template_generator.md"),
  "utf8",
);

const STAGE = "template_generator";

// No config block is required: with no stageModels entry the stage resolves to
// llm.model like any other. An operator who wants this on a stronger model adds
// `templateGenerator: { model }` to config.json without touching this file.
function tgen() {
  return config.templateGenerator || {};
}

const FAMILY_IDS = Object.keys(FAMILIES);
// new-pack.js RESOLVABLE — the families the renderer resolves without a bundled
// webfont. Kept in the same order/spelling so the two lists can be diffed.
const SAFE_FONTS = ["Inter", "Roboto", "Arial", "Helvetica", "Georgia", "system-ui"];
const DISPLAY_FONTS = [...Object.keys(FONT_FACES), ...SAFE_FONTS];

const HEX_RE = /^#[0-9a-f]{6}$/i;
// A plain family name — letters, digits, spaces, hyphen. No quotes (FRAME.md
// writes it as `fontFamily: "<name>"` and the registry parses that with a regex),
// no commas or semicolons (it would become a CSS fallback list or a declaration).
const FONT_RE = /^[A-Za-z][A-Za-z0-9 -]{1,31}$/;
// A colour role becomes a YAML key in the FRAME.md frontmatter block the
// registry scrapes for the pack's palette.
const ROLE_RE = /^[a-z][a-z0-9]{1,15}$/;
// The label is interpolated UNQUOTED into that same frontmatter
// (`name: <label> — Frame ...`). A newline would let it inject its own
// frontmatter lines or close the block early, so the charset is closed rather
// than escaped.
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9 &'’+-]{1,39}$/;

// The signature gradient-emphasis CSS, byte-identical to scripts/pack-catalog.js's
// GRAD(). Synthesized HERE from two validated hex values instead of being taken
// from the reply — that is the only way a generated pack gets CSS at all.
const GRAD = (a, b) =>
  `background:linear-gradient(100deg,${a},${b});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${a};`;

// ---- contrast ---------------------------------------------------------------
// Two bars, both measured against what the library already ships:
//   * WCAG ratio ≥ 7 — the 11 catalogued packs run 11.61:1 (care-mint) to
//     17.22:1 (nimbus-saas), so 7 rejects a weak pair without ever rejecting a
//     palette of the quality we ship.
//   * |lum Δ| ≥ 105 — scene_kit only honours an AUTHORED ink when it clears this
//     bar (see frame_manifest.js surface.ink); below it the pack silently loses
//     its own text colour to the max-contrast fallback, which is a broken pack
//     that still validates.
// Accents are deliberately NOT gated against the ground: shipped packs go as low
// as 1.90:1 (mint-launch's emerald on its white studio ground) because an accent
// is a device, not text — a gate here would reject the real catalog.
function rgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(hex) {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const chan = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const rel = (hex) => { const [r, g, bl] = rgb(hex); return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(bl); };
  const A = rel(a), B = rel(b);
  return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
}

// The bar the render-time contrast gate holds copy to (WCAG AA, large text).
const TEXT_CONTRAST_MIN = 3;

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v);
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The surface an accent has the HARDEST time on.
 *
 * A palette role is a SURFACE only if it sits near the ground (contrast under
 * 1.6:1) — the paper/mist/sand tints a panel is filled with. Roles that already
 * stand off the ground are foreground devices, and the accent is one of them:
 * counting it made the first attempt repair the accent against ITSELF (a
 * mid-tone teal reads as "light" by luminance) and drove #2fa5a0 to #164e4b.
 *
 * The returned surface is then shaded one notch further from the ground, because
 * the renderer composites gradients and scrims over these tints: the tone QA
 * actually sampled behind the failing copy was #d2e2e1, darker than every
 * authored colour in the pack.
 */
const SURFACE_MAX_CONTRAST = 1.6;
const BLEND_SHADE = 0.10;

function worstSurface(ground, colors) {
  const light = lum(ground) > 128;
  const tints = Object.values(colors || {}).filter((c) => contrastRatio(c, ground) < SURFACE_MAX_CONTRAST);
  const worst = [ground, ...tints].reduce((w, c) => (
    light ? (lum(c) < lum(w) ? c : w) : (lum(c) > lum(w) ? c : w)
  ), ground);
  const [h, s, l] = toHsl(rgb(worst));
  return hslToHex(h, s, Math.max(0, Math.min(1, light ? l - BLEND_SHADE : l + BLEND_SHADE)));
}

/**
 * Walk an accent's LIGHTNESS — hue and saturation untouched — until it clears
 * TEXT_CONTRAST_MIN against `ground`, moving away from the ground's own
 * luminance (darker on a light ground, lighter on a dark one). Returns null when
 * the accent already passes, so the common case costs one contrast check.
 */
function legibleAccent(accent, ground) {
  const was = contrastRatio(accent, ground);
  if (was >= TEXT_CONTRAST_MIN) return null;
  const [h, s, l0] = toHsl(rgb(accent));
  const darken = lum(ground) > 128; // light ground -> go darker
  for (let step = 1; step <= 100; step++) {
    const l = darken ? l0 - step / 100 : l0 + step / 100;
    if (l <= 0 || l >= 1) break;
    const hex = hslToHex(h, s, l);
    const now = contrastRatio(hex, ground);
    if (now >= TEXT_CONTRAST_MIN) return { hex, from: accent, was, now };
  }
  // Pure black/white is the last resort — only reachable for a fully saturated
  // hue against a mid-grey ground, where no lightness of that hue can pass.
  const hex = darken ? "#000000" : "#ffffff";
  return { hex, from: accent, was, now: contrastRatio(hex, ground) };
}

// ---- the MOTION vocabulary ---------------------------------------------------
// A generated template used to be a palette and two fonts over a family, which
// meant two packs on the same family shared every animation they had — the same
// entrance, the same emphasis, the same cut, the same canvas. They were skins of
// one another, and that is exactly what "all the templates should be unique"
// rules out.
//
// buildManifest already merges v.textfx / v.motion / v.fx over the family
// defaults, so the plumbing was there and unused. These are the CLOSED sets
// scene_kit actually implements — 19 entrances x 16 emphases x 18 cuts x 20
// canvases is ~109k distinct motion personalities, and every one of them is a
// token the renderer already knows how to draw. The model picks from this list;
// it never writes animation code, so "personalized animation" costs no new
// execution surface.
const { TEXT_ENTERS, EMPHASIS_STYLES, CUT_STYLES, CANVAS_MODES } = require("./scene_kit");

const CASES = new Set(["none", "upper"]);
const ALIGNS = new Set(["left", "center", "right", "rotate"]);

// The signature two templates must not share. Palette alone is not identity —
// these four are what a viewer actually reads as "a different template".
const motionSignature = (v) => [
  (v.textfx || {}).enter, (v.textfx || {}).emphasis,
  (v.motion || {}).cut, (v.fx || {}).canvas,
].join("|");

const inSet = (set, value) => set.has(String(value || "").toLowerCase().trim());

function num(value, lo, hi, dflt) {
  const n = Number(value);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

// PURE. spec.textfx/motion/fx -> validated tokens, or problems. Absent blocks are
// not an error: the family default stands, which is how a brief that says nothing
// about motion still builds.
function motionFromSpec(spec, problems) {
  const out = {};
  const tf = spec.textfx && typeof spec.textfx === "object" ? spec.textfx : null;
  if (tf) {
    const enter = str(tf.enter).toLowerCase();
    const emphasis = str(tf.emphasis).toLowerCase();
    if (enter && !inSet(TEXT_ENTERS, enter)) problems.push(`textfx.enter must be one of: ${[...TEXT_ENTERS].join(", ")} (got ${JSON.stringify(tf.enter)})`);
    if (emphasis && !inSet(EMPHASIS_STYLES, emphasis)) problems.push(`textfx.emphasis must be one of: ${[...EMPHASIS_STYLES].join(", ")} (got ${JSON.stringify(tf.emphasis)})`);
    const textfx = {};
    if (enter && inSet(TEXT_ENTERS, enter)) textfx.enter = enter;
    if (emphasis && inSet(EMPHASIS_STYLES, emphasis)) textfx.emphasis = emphasis;
    if (tf.case != null) {
      const c = str(tf.case).toLowerCase();
      if (!CASES.has(c)) problems.push(`textfx.case must be "none" or "upper"`); else textfx.case = c;
    }
    if (tf.align != null) {
      const a = str(tf.align).toLowerCase();
      if (!ALIGNS.has(a)) problems.push(`textfx.align must be one of: ${[...ALIGNS].join(", ")}`); else textfx.align = a;
    }
    if (tf.tracking != null) textfx.tracking = num(tf.tracking, -0.06, 0.14, 0);
    if (tf.sizeScale != null) textfx.sizeScale = num(tf.sizeScale, 0.85, 1.2, 1);
    if (tf.weight != null) textfx.weight = Math.round(num(tf.weight, 400, 900, 800) / 100) * 100;
    // PACE. Scales the headline entrance timings in scene_kit — 1 is the shipped
    // speed, higher is snappier. Capped at 1.6 because past that the stagger
    // collapses and the words arrive as one block instead of reading in.
    if (tf.speed != null) textfx.speed = num(tf.speed, 0.85, 1.6, 1);
    if (Object.keys(textfx).length) out.textfx = textfx;
  }

  const mo = spec.motion && typeof spec.motion === "object" ? spec.motion : null;
  if (mo) {
    const cut = str(mo.cut).toLowerCase();
    if (cut && !inSet(CUT_STYLES, cut)) problems.push(`motion.cut must be one of: ${[...CUT_STYLES].join(", ")} (got ${JSON.stringify(mo.cut)})`);
    const motion = {};
    if (cut && inSet(CUT_STYLES, cut)) motion.cut = cut;
    if (mo.drift != null) motion.drift = num(mo.drift, 1, 1.08, 1.03);
    if (Object.keys(motion).length) out.motion = motion;
  }

  const fx = spec.fx && typeof spec.fx === "object" ? spec.fx : null;
  if (fx) {
    const canvas = str(fx.canvas).toLowerCase();
    if (canvas && !inSet(CANVAS_MODES, canvas)) problems.push(`fx.canvas must be one of: ${[...CANVAS_MODES].join(", ")} (got ${JSON.stringify(fx.canvas)})`);
    // `three` is deliberately NOT taken from the model: it selects a WebGL scene
    // and only a handful of packs ship one.
    if (canvas && inSet(CANVAS_MODES, canvas)) out.fx = { canvas };
  }
  return out;
}

// ---- spec validation ---------------------------------------------------------
// Every problem is collected (not thrown on the first one) so a repair lap gets
// the complete list in one go instead of one fix per round trip.
function specError(problems) {
  const err = new Error(`invalid variant spec: ${problems.join("; ")}`);
  err.problems = problems;
  err.stage = "spec";
  return err;
}

const str = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
// Word-boundary safe truncation (same reason as text_director's clip: a raw
// slice cuts prose mid-word, and this line is read by the composer).
function clip(v, n) {
  const t = str(v);
  if (t.length <= n) return t;
  const cut = t.slice(0, n), sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, "");
}

function hexAt(spec, key, problems) {
  const v = str(spec[key]);
  if (!HEX_RE.test(v)) { problems.push(`${key} must be a #RRGGBB colour, got ${JSON.stringify(spec[key])}`); return null; }
  return v.toLowerCase();
}

function fontAt(spec, key, problems) {
  const v = str(spec[key]);
  if (!FONT_RE.test(v)) { problems.push(`${key} must be a plain font family name, got ${JSON.stringify(spec[key])}`); return null; }
  // Same bar new-pack.js's assertRenderableDisplay applies to the display face,
  // extended to body/label: a family that is neither bundled nor safe silently
  // renders as a generic sans, which is a pack that has lost its typographic
  // identity while still passing every schema check.
  const canonical = DISPLAY_FONTS.find((f) => f.toLowerCase() === v.toLowerCase());
  if (!canonical && !isBundled(v)) {
    problems.push(`${key} "${v}" is not a bundled or safe family — choose one of: ${DISPLAY_FONTS.join(", ")}`);
    return null;
  }
  // Return the catalogued spelling: "ibm plex mono" resolves at render time but
  // would be quoted verbatim in FRAME.md's typography block and the pack's prose.
  return canonical || v;
}

/**
 * PURE. Raw model reply -> the VARIANT object scripts/new-pack.js consumes.
 * Throws an Error whose `.problems` is the full list of violations; the caller
 * feeds that list back verbatim as the repair prompt.
 */
function buildVariantFromSpec(spec, { slug, usedSignatures } = {}) {
  const problems = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw specError(["reply is not a JSON object"]);
  }
  if (!store.validSlug(slug)) throw specError([`caller passed an invalid slug "${slug}"`]);

  // `name` is the pack id AND the directory name under frames/ once published,
  // so it is not negotiable: it must be the slug the admin already reserved.
  const name = str(spec.name);
  if (name !== slug) problems.push(`name must be exactly "${slug}", got ${JSON.stringify(spec.name)}`);

  const family = str(spec.family).toLowerCase();
  if (!FAMILIES[family]) problems.push(`family must be one of ${FAMILY_IDS.join(", ")}, got ${JSON.stringify(spec.family)}`);

  const label = str(spec.label);
  if (!LABEL_RE.test(label)) problems.push(`label must be 2-40 chars of letters, digits and spaces, got ${JSON.stringify(spec.label)}`);

  const overview = clip(spec.overview, 180);
  if (overview.length < 10) problems.push("overview must be one sentence of at least 10 characters");

  const ground = hexAt(spec, "ground", problems);
  const ink = hexAt(spec, "ink", problems);
  if (ground && ink) {
    const ratio = contrastRatio(ground, ink);
    const delta = Math.abs(lum(ground) - lum(ink));
    if (ratio < 7 || delta < 105) {
      problems.push(`ground ${ground} and ink ${ink} are too close (${ratio.toFixed(2)}:1, luminance Δ ${delta.toFixed(0)}) — a dark ground needs a near-white ink and a light ground a near-black one`);
    }
  }

  const colors = {};
  const rawColors = spec.colors && typeof spec.colors === "object" && !Array.isArray(spec.colors) ? spec.colors : null;
  if (!rawColors) {
    problems.push("colors must be an object of role -> #RRGGBB");
  } else {
    // 8 roles is the ceiling (the catalog authors 6); the rest are dropped
    // rather than rejected, since an extra hue costs nothing but noise.
    for (const [role, value] of Object.entries(rawColors).slice(0, 8)) {
      const key = str(role).toLowerCase();
      const hex = str(value);
      if (!ROLE_RE.test(key)) { problems.push(`colors role "${role}" must be a lowercase single word`); continue; }
      if (!HEX_RE.test(hex)) { problems.push(`colors.${key} must be a #RRGGBB colour, got ${JSON.stringify(value)}`); continue; }
      colors[key] = hex.toLowerCase();
    }
    if (Object.keys(colors).length < 3) problems.push("colors must carry at least 3 valid roles");
    // FRAME.md's prose and the manifest both quote colors.ink as the pack's text
    // colour; a table that disagrees with the authored ink ships a pack whose
    // documentation and renderer say different things.
    if (ink && colors.ink !== ink) problems.push(`colors.ink must be present and equal the top-level ink (${ink || "?"})`);
  }

  const accents = [];
  for (const [i, a] of (Array.isArray(spec.accents) ? spec.accents : []).slice(0, 2).entries()) {
    const hex = str(a);
    if (!HEX_RE.test(hex)) { problems.push(`accents[${i}] must be a #RRGGBB colour, got ${JSON.stringify(a)}`); continue; }
    accents.push(hex.toLowerCase());
  }
  // buildFrameMd destructures both: with one accent the pack's prose reads
  // "…; undefined is the secondary".
  if (accents.length !== 2) problems.push("accents must be exactly two #RRGGBB colours [primary, secondary]");
  else if (accents[0] === accents[1]) problems.push("the two accents must differ");

  const extras = [];
  for (const [i, e] of (Array.isArray(spec.extras) ? spec.extras : []).slice(0, 2).entries()) {
    const hex = str(e);
    if (!HEX_RE.test(hex)) { problems.push(`extras[${i}] must be a #RRGGBB colour, got ${JSON.stringify(e)}`); continue; }
    extras.push(hex.toLowerCase());
  }

  const display = fontAt(spec, "display", problems);
  const body = fontAt(spec, "body", problems);
  const labelFont = fontAt(spec, "labelFont", problems);

  // Motion first, so a bad token is reported in the SAME pass as a bad colour —
  // the retry appends every problem at once, and two round trips to fix two
  // fields is one more Opus call than this is worth.
  const motionParts = motionFromSpec(spec, problems);

  // UNIQUENESS. Checked here rather than after the build so a duplicate becomes
  // a `problem` like any other and rides the existing retry, which appends the
  // taken list to the prompt.
  if (usedSignatures && usedSignatures.size) {
    const sig = motionSignature(motionParts);
    if (sig !== "|||" && usedSignatures.has(sig)) {
      problems.push(
        `this motion signature is already used by another template (${sig}) — change at least two of textfx.enter, textfx.emphasis, motion.cut, fx.canvas`
      );
    }
  }

  if (problems.length) throw specError(problems);

  // ---- accent legibility repair ------------------------------------------
  // Families render real copy in the PRIMARY accent (healthcare-soft sets its
  // pull-quotes in it), so an accent chosen only to look good beside the ground
  // ships text the contrast gate then blocks: the first generated pack drew its
  // quotes at 2.85:1 against a #f7fafa ground and QA refused it, naming six
  // words. Rejecting the spec would be the wrong cure — the accent is usually
  // the admin's own brand colour, and a retry cannot guess the bar. So the hue
  // is kept and only the lightness moves, the minimum distance that clears AA.
  // The SECONDARY accent is left alone: it is decoration, and the shipped
  // library runs it as low as 1.90:1 (mint-launch).
  // Repaired against the WORST surface the pack can paint behind that text, not
  // just the ground: the family tints panels with its own light roles (and the
  // renderer blends them), and the first failure was measured at 2.24:1 over a
  // #d2e2e1 blend while the same accent read 2.85:1 over the #f7fafa ground.
  // Clearing only the ground would have left the gate still failing.
  const accentFix = accents.length === 2 && ground
    ? legibleAccent(accents[0], worstSurface(ground, colors))
    : null;
  if (accentFix) {
    const from = accents[0];
    accents[0] = accentFix.hex;
    // Keep the palette table honest: the family maps a colors role onto the
    // primary accent, and that role — not accents[0] — is what the renderer
    // paints the text with. Repairing one without the other fixes nothing.
    for (const [role, value] of Object.entries(colors)) {
      if (value === from) colors[role] = accentFix.hex;
    }
  }

  // Whitelist by construction — nothing from `spec` reaches the manifest except
  // the values validated above.
  const variant = {
    name: slug, family, label, overview,
    // THE OVERVIEW *IS* THE VIBE. buildManifest reads `v.vibe` and falls back to
    // the FAMILY's tone, so the world-naming sentence the model was asked for was
    // being written and then thrown away: a cat-toy template shipped with
    // healthcare-soft's "a calm, humane care system… for healthcare, wellness,
    // patient" as its vibe. That field is not decoration — getPackVibe feeds it to
    // asset keywords and downstream prompts, so a wrong vibe misdirects the whole
    // pipeline.
    vibe: overview,
    colors, ground, ink, accents, extras,
    display, body, labelFont,
    // Merged over the family's defaults by buildManifest, so a spec that named
    // only an entrance keeps the family's cut and canvas.
    ...motionParts,
  };
  // Reported, not authored: non-enumerable so it cannot ride a spread or a
  // JSON.stringify into pack.json (PackManifestSchema passes unknown keys
  // through, so an enumerable field here would silently become manifest noise).
  if (accentFix) {
    Object.defineProperty(variant, "accentAdjusted", {
      value: { from: accentFix.from, to: accentFix.hex, was: accentFix.was, now: accentFix.now },
      enumerable: false,
    });
  }
  // The three gradient-emphasis families (fintech-dark, saas-gradient,
  // liquid-glass) carry a text gradient in the catalog; the rest emphasize with
  // a box, marker or glow the renderer draws itself.
  if ((FAMILIES[family].textfx || {}).emphasis === "gradient") {
    variant.emphasisCss = GRAD(accents[0], accents[1]);
  }
  return variant;
}

/**
 * PURE. spec -> { spec: variant, manifest, frameMd }. The manifest is validated
 * against PackManifestSchema here, BEFORE any caller touches the filesystem.
 */
function buildPackFromSpec(spec, { slug, orientation, usedSignatures } = {}) {
  const variant = buildVariantFromSpec(spec, { slug, usedSignatures });
  const built = buildPack(variant); // throws on an unknown family / unrenderable display
  // ORIENTATION. new-pack.js has no notion of it — every pack it builds renders
  // 16:9 — but 128 of the 203 shipped packs carry a top-level `portraitNative`,
  // and it is what makes a vertical template compose 1080x1920 instead of being
  // letterboxed into 1280x720. Without it a template created as "vertical" also
  // files itself into the gallery's HORIZONTAL tab, because /api/frames reads
  // the tab from poster.jpg's dimensions. Measured on the first generated pack:
  // rendered 1280x720 and QA blocked it by name.
  if (String(orientation || "").toLowerCase() === "vertical") built.manifest.portraitNative = true;
  // buildManifest already parses, but the write path must not depend on that
  // staying true: this is the gate that says nothing unvalidated reaches disk.
  const manifest = PackManifestSchema.parse(built.manifest);
  return { spec: variant, manifest, frameMd: built.frameMd };
}

// ---- confined writes ---------------------------------------------------------
// §21: generated content stays inside the staging directory. Both the slug and
// the version reach a filesystem path, so containment is PROVEN here rather than
// trusted from upstream validation — a crafted slug ("../../server/src") or a
// non-numeric version must never be able to name frames/, server code, config or
// an env file.
const DRAFT_ROOT = path.resolve(store.DRAFT_SRC);

function resolveDraftDir(slug, version) {
  if (!store.validSlug(slug)) throw new Error(`refusing to write: invalid slug "${slug}"`);
  const v = Number(version);
  if (!Number.isInteger(v) || v < 1) throw new Error(`refusing to write: invalid version "${version}"`);
  const dir = path.resolve(store.draftSourceDir(slug, v));
  const expected = path.join(DRAFT_ROOT, slug, `v${v}`);
  if (dir !== expected || !dir.startsWith(DRAFT_ROOT + path.sep)) {
    throw new Error(`refusing to write outside the staging directory: ${dir}`);
  }
  return dir;
}

function writeConfined(dir, file, contents) {
  const p = path.resolve(dir, file);
  if (p !== path.join(dir, file) || !p.startsWith(dir + path.sep)) {
    throw new Error(`refusing to write outside the version directory: ${p}`);
  }
  fs.writeFileSync(p, contents, "utf8");
  return p;
}

// The two files a pack IS since Phase 3: the manifest every render path reads
// and the FRAME.md the registry lists on and the composer is prompted with.
function writeBuiltPack({ slug, version, built }) {
  const sourceDir = resolveDraftDir(slug, version);
  fs.mkdirSync(sourceDir, { recursive: true });
  const files = [
    writeConfined(sourceDir, "pack.json", JSON.stringify(built.manifest, null, 2) + "\n"),
    writeConfined(sourceDir, "FRAME.md", built.frameMd),
  ];
  return { spec: built.spec, manifest: built.manifest, sourceDir, files };
}

/**
 * Materialize a spec into the version's staging directory. Exported on its own
 * so QA, tests and a rebuild-from-stored-spec can run the whole path with no
 * LLM. Throws (validation, containment, I/O); generateTemplateVersion catches.
 * -> { spec, manifest, sourceDir, files }
 */
function writeVersionFromSpec({ template, version, spec }) {
  const built = buildPackFromSpec(spec, {
    slug: template && template.slug,
    orientation: template && template.orientation,
  });
  return writeBuiltPack({ slug: template.slug, version, built });
}

// ---- the LLM pass ------------------------------------------------------------
/**
 * Every motion signature the LIVE library already uses, read straight from the
 * shipped pack manifests. Uniqueness has to be measured against what exists on
 * disk, not against this batch: a new template that animates exactly like
 * blockframe is a duplicate even if nothing else in the run looks like it.
 * Fails open (empty set) — an unreadable manifest must not block generation.
 */
function usedMotionSignatures() {
  const sigs = new Set();
  let names = [];
  try { names = listManifests() || []; } catch { return sigs; }
  for (const name of names) {
    try {
      const m = getManifest(name);
      if (m) sigs.add([m.textfx?.enter, m.textfx?.emphasis, m.motion?.cut, m.fx?.canvas].join("|"));
    } catch { /* skip an unreadable pack */ }
  }
  sigs.delete("|||");
  return sigs;
}

// The family the CALLER asked for, if it named a real one. Checked against
// FAMILIES so a stale or invented value falls back to "let the model choose"
// rather than producing a pack buildPack() cannot build.
function requestedFamily({ brief, template }) {
  const gen = (template && template.generation) || {};
  const want = String((brief && brief.family) || gen.family || "").toLowerCase().trim();
  return FAMILIES[want] ? want : null;
}

function buildUser({ template, version, brief, usedSignatures }) {
  const b = brief || {};
  const gen = (template && template.generation) || {};
  const tags = Array.isArray(b.tags) ? b.tags : (template && template.tags) || [];
  const lines = [
    `slug: ${template.slug}          (the "name" field MUST be exactly this)`,
    `display name: ${b.name || template.name || template.slug}`,
    `orientation: ${b.orientation || template.orientation || "horizontal"}`,
    `version: v${version}`,
  ];
  // A REQUESTED FAMILY IS AN INSTRUCTION, NOT A HINT. The admin form has a family
  // picker and the auto batch assigns one per brief precisely so a run spans all
  // six renderers — but this prompt never mentioned family, so the model inferred
  // it from the prose every time and both controls were silently decorative.
  // (forceFamily below then holds the model to it.)
  const wantFamily = requestedFamily({ brief: b, template });
  if (wantFamily) lines.push(`renderer family: ${wantFamily}   (use EXACTLY this family; design the palette and fonts to suit it)`);
  const opt = [
    ["category", b.category || template.category],
    ["tags", tags.length ? tags.join(", ") : null],
    ["style", b.style || gen.style],
    ["brand colour", b.brandColor || gen.brandColor],
    ["duration", (b.durationSec || gen.durationSec) ? `${b.durationSec || gen.durationSec}s` : null],
    ["notes", b.notes || gen.notes],
  ];
  for (const [k, v] of opt) if (v) lines.push(`${k}: ${String(v).replace(/\s+/g, " ").trim().slice(0, 300)}`);

  // The taken signatures go in the PROMPT, not just the validator. Letting the
  // model discover a clash by being rejected costs a whole Opus round trip; a
  // list it can read costs a few hundred cached tokens. Capped because the
  // library is 203 packs deep and the point is a sample of what to avoid, not an
  // exhaustive ledger.
  const taken = usedSignatures && usedSignatures.size ? [...usedSignatures] : [];
  const avoid = taken.length
    ? ["", `ALREADY USED — do not repeat any of these enter|emphasis|cut|canvas combinations (${taken.length} in the library):`,
      taken.slice(0, 60).join("  "), taken.length > 60 ? `…and ${taken.length - 60} more` : ""].filter(Boolean).join("\n")
    : "";

  return [
    "ADMIN BRIEF",
    lines.join("\n"),
    "",
    "prompt:",
    String(b.prompt || gen.prompt || template.description || "").trim().slice(0, 2000) || "(no prompt given — design from the display name and category)",
    avoid,
    "",
    "Return the variant JSON object only.",
  ].join("\n");
}

// A repair lap that names every violation. openrouter appends userSuffix after
// the (constant) brief so providers can prompt-cache the prefix across laps.
function repairSuffix(problems) {
  return [
    "Your previous reply was REJECTED. Fix exactly these problems and return the whole variant object again:",
    ...problems.map((p) => `- ${p}`),
    "Return the corrected JSON object only.",
  ].join("\n");
}

/**
 * prompt -> VARIANT -> pack files in the staging directory.
 * -> { ok: true, spec, manifest, sourceDir, files, model, attempts }
 * -> { ok: false, error, stage, attempts, spec: null, manifest: null, sourceDir: null, files: [] }
 * Never throws for a model failure — the caller maps `error` into
 * setStatus(FAILED, { error }).
 */
async function generateTemplateVersion({ template, version, brief, tracker, signal } = {}) {
  if (!template || !store.validSlug(template.slug)) {
    return { ok: false, stage: "spec", error: `template has no valid slug (${template && template.slug})`, attempts: 0, spec: null, manifest: null, sourceDir: null, files: [] };
  }

  // Read once per generation, not per attempt: the library does not change
  // mid-call, and a retry must be judged against the same set the first lap was.
  const usedSignatures = usedMotionSignatures();
  const user = buildUser({ template, version, brief, usedSignatures });
  const failures = [];
  let suffix = null;
  let lastStage = "llm";

  // ONE retry. The failure mode this catches is a model that got a field wrong
  // (a 3-digit hex, a font that isn't bundled, the label as `name`), and naming
  // the violations fixes it in a single lap; a model that fails twice on an
  // explicit list is not going to succeed on a third.
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (signal?.aborted) { failures.push("cancelled"); break; }
    try {
      const { text, tokensIn, tokensOut, costUsd, model } = await openrouter.chat({
        system: SYSTEM,
        user,
        userSuffix: suffix,
        jsonMode: true,
        stage: STAGE,
        model: tgen().model || undefined,
        // Warm on the first pass (a palette is an invention), cold on the repair
        // pass (there it must transcribe the corrections, not re-imagine them).
        temperature: attempt === 1 ? 0.65 : 0.2,
        signal,
      });
      if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: STAGE, costUsd });

      lastStage = "spec";
      const raw = extractFirstJsonObject(text);
      // Models occasionally wrap the object they were asked for.
      const spec = raw && typeof raw.variant === "object" && raw.variant ? raw.variant
        : raw && typeof raw.spec === "object" && raw.spec ? raw.spec
        : raw;

      // Orientation comes from the template record the admin created, never from
      // the model: it decides the render aspect and the gallery tab.
      const orientation = (brief && brief.orientation) || template.orientation;
      // Same for a requested family: the prompt asks for it, this enforces it.
      // Without the override a batch that deliberately spread six briefs across
      // six renderers could still land three of them on saas-gradient because the
      // prose read "modern" — and the admin would have no way to tell.
      const wantFamily = requestedFamily({ brief, template });
      if (wantFamily && spec && typeof spec === "object" && spec.family !== wantFamily) {
        console.log(`[template_gen] ${template.slug}: pinning family ${JSON.stringify(spec.family)} -> ${wantFamily} (requested)`);
        spec.family = wantFamily;
      }
      // PINNED MOTION. A campaign allocates each template a distinct, library-rare
      // signature up front (see admin/campaign.js) precisely because a model asked
      // for variety converges — the first ungoverned batch put the same cut on 3 of
      // 5 templates. The model still designs the palette and type AROUND the
      // motion; it does not get to renegotiate it.
      const pin = brief && brief.pinMotion;
      if (pin && spec && typeof spec === "object") {
        spec.textfx = { ...(spec.textfx || {}), enter: pin.enter, emphasis: pin.emphasis };
        spec.motion = { ...(spec.motion || {}), cut: pin.cut };
        spec.fx = { ...(spec.fx || {}), canvas: pin.canvas };
      }
      const built = buildPackFromSpec(spec, { slug: template.slug, orientation, usedSignatures });

      lastStage = "write";
      const out = writeBuiltPack({ slug: template.slug, version, built });
      const adj = built.spec.accentAdjusted;
      if (adj) console.log(`[template_gen] ${template.slug}: accent ${adj.from} -> ${adj.to} for legibility (${adj.was.toFixed(2)}:1 -> ${adj.now.toFixed(2)}:1 vs ground)`);
      console.log(`[template_gen] ${template.slug} v${version}: family=${out.spec.family} display=${out.spec.display} ground=${out.spec.ground} ink=${out.spec.ink} portrait=${built.manifest.portraitNative === true} (attempt ${attempt}, ${model})`);
      return { ok: true, ...out, model, attempts: attempt };
    } catch (err) {
      const problems = Array.isArray(err?.problems) ? err.problems : null;
      const msg = String((err && err.message) || err).slice(0, 600);
      failures.push(`attempt ${attempt}: ${msg}`);
      console.warn(`[template_gen] ${template.slug} v${version} attempt ${attempt} failed: ${msg}`);
      // Only a bad SPEC is worth re-asking for. A schema/containment/disk failure
      // is ours, not the model's — a second identical call just spends money.
      if (!problems) break;
      suffix = repairSuffix(problems);
    }
  }

  return {
    ok: false,
    stage: lastStage,
    error: failures.join(" | ") || "generation produced nothing",
    attempts: failures.length,
    spec: null, manifest: null, sourceDir: null, files: [],
  };
}

module.exports = {
  generateTemplateVersion,
  buildVariantFromSpec,
  buildPackFromSpec,
  writeVersionFromSpec,
  FAMILY_IDS,
  DISPLAY_FONTS,
};
