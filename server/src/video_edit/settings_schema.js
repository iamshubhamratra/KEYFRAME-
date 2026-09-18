// VIDEO EDIT PROJECT SETTINGS SCHEMA — what a user may ask of an edit (API.md §7).
//
// WHY THIS EXISTS. Settings arrive as a JSON string inside a multipart upload and later as partial
// patches from the editor. Both must land on ONE fully-populated, validated object, or every stage
// downstream re-implements defaults and guards. The schema strips unknown keys (a client can
// never smuggle a field the engine will read), and `debugFaults` survives only where fault
// injection is allowed — a production client cannot switch on failure modes.
//
// CONTRACT:
//   SettingsSchema        zod object (fully-populated shape)
//   DEFAULT_SETTINGS      frozen defaults
//   normalizeSettings(input, { allowDebugFaults=false, maxUsdCap=null, base=DEFAULT_SETTINGS })
//     -> { ok, value, errors:[string] }   — input is deep-merged onto `base` first, so a partial
//        object (or a JSON string) is fine. consent.thirdPartyAi===true at create is enforced by the
//        caller (CONSENT_REQUIRED), not here, so a stored project can still be re-normalized.

const { z } = require("zod");

const LANGUAGES = Object.freeze(["en", "hi", "es", "fr", "de", "pt", "ar", "ja"]);
const CAPTION_STYLES = Object.freeze(["bold_pop", "clean", "karaoke_blob", "single_word", "minimal_lower", "brand_bar"]);
const HEX = /^#[0-9a-fA-F]{6}$/;

const PaletteSchema = z.object({
  primary: z.string().regex(HEX),
  secondary: z.string().regex(HEX).optional(),
  source: z.enum(["preset", "manual", "logo"]),
  presetId: z.string().max(40).optional(),
}).strip();

const SettingsSchema = z.object({
  title: z.string().max(120).optional(),
  language: z.enum(["auto", ...LANGUAGES]),
  output: z.object({ aspect: z.enum(["source", "9:16", "16:9", "1:1"]) }).strip(),
  captions: z.object({
    enabled: z.boolean(),
    styleId: z.enum(CAPTION_STYLES),
    maxWordsPerLine: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    position: z.enum(["auto", "top", "center", "bottom"]),
    language: z.enum(["auto", ...LANGUAGES]),
  }).strip(),
  brand: z.object({
    palette: PaletteSchema.nullable(),
    logo: z.object({ placement: z.enum(["tl", "tr", "bl", "br"]), show: z.enum(["always", "intro_outro"]) }).strip(),
  }).strip(),
  music: z.object({
    enabled: z.boolean(),
    mood: z.string().max(40).optional(),
    volumeDb: z.number().min(-30).max(0).optional(),
  }).strip(),
  sfx: z.object({ enabled: z.boolean() }).strip(),
  broll: z.object({
    enabled: z.boolean(),
    intensity: z.enum(["low", "medium", "high"]),
    allowImages: z.boolean(),
  }).strip(),
  effects: z.object({ intensity: z.enum(["subtle", "dynamic"]), autoJumpCuts: z.boolean() }).strip(),
  removeFillers: z.enum(["off", "light", "aggressive"]),
  removeSilence: z.object({ enabled: z.boolean(), pace: z.enum(["natural", "fast", "extra_fast"]) }).strip(),
  goals: z.string().max(500).optional(),
  autoRender: z.boolean(),
  exportProfile: z.enum(["export1080", "export720"]),
  privacy: z.object({ allowCloudVision: z.boolean() }).strip(),
  consent: z.object({ thirdPartyAi: z.boolean(), termsVersion: z.string().max(40) }).strip(),
  maxCostUsd: z.number().positive().max(1000).optional(),
  debugFaults: z.string().max(500).optional(),
}).strip();

const DEFAULT_SETTINGS = deepFreeze({
  language: "auto",
  output: { aspect: "source" },
  captions: { enabled: true, styleId: "bold_pop", maxWordsPerLine: 3, position: "auto", language: "auto" },
  brand: { palette: null, logo: { placement: "tr", show: "always" } },
  music: { enabled: true },
  sfx: { enabled: true },
  broll: { enabled: true, intensity: "medium", allowImages: true },
  effects: { intensity: "subtle", autoJumpCuts: true },
  removeFillers: "light",
  removeSilence: { enabled: true, pace: "natural" },
  autoRender: true,
  exportProfile: "export1080",
  privacy: { allowCloudVision: true },
  consent: { thirdPartyAi: false, termsVersion: "" },
});

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Deep merge for plain objects only. Arrays and null REPLACE (palette: null clears a palette).
// `__proto__`/`constructor`/`prototype` keys are skipped — this runs on client JSON.
function deepMerge(base, patch) {
  if (!isPlain(patch)) return patch === undefined ? clone(base) : patch;
  const out = isPlain(base) ? clone(base) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function formatIssues(error) {
  return error.issues.map((i) => `${i.path.length ? i.path.join(".") : "settings"}: ${i.message}`);
}

function normalizeSettings(input, { allowDebugFaults = false, maxUsdCap = null, base = DEFAULT_SETTINGS } = {}) {
  let raw = input;
  if (typeof raw === "string") {
    if (raw.length > 64 * 1024) return { ok: false, value: null, errors: ["settings: too large"] };
    try { raw = raw.trim() ? JSON.parse(raw) : {}; }
    catch { return { ok: false, value: null, errors: ["settings: not valid JSON"] }; }
  }
  if (raw == null) raw = {};
  if (!isPlain(raw)) return { ok: false, value: null, errors: ["settings: expected an object"] };

  const merged = deepMerge(base, raw);
  if (!allowDebugFaults) delete merged.debugFaults;
  const parsed = SettingsSchema.safeParse(merged);
  if (!parsed.success) return { ok: false, value: null, errors: formatIssues(parsed.error) };

  const value = parsed.data;
  const errors = [];
  if (value.maxCostUsd != null && Number.isFinite(maxUsdCap) && value.maxCostUsd > maxUsdCap) {
    errors.push(`maxCostUsd: must be at most ${maxUsdCap}`);
  }
  if (errors.length) return { ok: false, value: null, errors };
  return { ok: true, value, errors: [] };
}

module.exports = { SettingsSchema, DEFAULT_SETTINGS, normalizeSettings, deepMerge, LANGUAGES, CAPTION_STYLES };
