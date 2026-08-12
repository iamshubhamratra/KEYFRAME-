// SCENE ROLE — the canonical narrative vocabulary, and the one place that maps a
// script's free-text `purpose` onto it.
//
// WHY THIS EXISTS. `SceneSchema.purpose` is `z.string().min(2).max(24)` — deliberately
// free text, because it is shown to the user in the Script Room ("The Solution",
// "Why it matters") and a human-readable label is worth having. But four call sites
// then switched on it by EXACT STRING MATCH:
//
//   ["feature","proof","how","context"].includes(scene.purpose)   ×4 (graph,
//       project_pipeline, user_assets, website_assets — copy-pasted, free to drift)
//   PURPOSE_KIND[purpose]                                         (asset_taxonomy)
//
// So a model that wrote "benefit", "demo", "solution" or "the problem" matched
// NOTHING: that scene silently stopped being a showcase target, and every real
// website screenshot / user upload that should have been pinned to it went
// elsewhere. The failure is invisible — nothing errors, the film just quietly
// stops showing the product where the script said to show it.
//
// The fix is NOT to constrain the model's wording (the label has real UI value) but
// to derive a canonical `role` from it, once, deterministically. `purpose` stays
// exactly as authored — the composers' fuzzy matching and the Script Room still read
// it. Consumers that need a DECISION read `roleOf(scene)`.
//
// Pure functions, no I/O. Unknown input degrades to "feature", never throws.

const ROLES = ["hook", "context", "feature", "proof", "how", "quote", "cta"];
const ROLE_SET = new Set(ROLES);

// Ordered most-specific first: a purpose like "how it proves out" should read as
// `how`, and "closing proof" as `cta`, so the patterns are tried in this order and
// the first hit wins.
const PATTERNS = [
  ["cta",     /\b(cta|call\s*to\s*action|close|closing|outro|end|ending|finish|final|sign\s*up|signup|subscribe|download|get\s*started|start\s*now|try\s*(it|now|free)|book|contact|convert|conclusion)\b/],
  ["hook",    /\b(hook|intro|introduction|open|opening|title|teaser|attention|cold\s*open|tease|grab)\b/],
  ["quote",   /\b(quote|quotation|saying|words|voice\s*of)\b/],
  ["proof",   /\b(proof|prove|stat|stats|statistic|data|metric|metrics|number|numbers|result|results|outcome|evidence|testimonial|review|social\s*proof|trust|credibility|case\s*study|validation)\b/],
  ["how",     /\b(how|step|steps|process|workflow|walkthrough|tutorial|guide|usage|instruction|setup|onboard)\b/],
  ["context", /\b(context|problem|pain|challenge|struggle|why|background|setup|situation|before|status\s*quo|gap|need)\b/],
  ["feature", /\b(feature|features|benefit|benefits|solution|product|showcase|capability|capabilities|what|offering|value|demo|demonstration|overview|highlight|detail|spec)\b/],
];

// Free text → canonical role, or null when nothing matches.
function coerceRole(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return null;
  if (ROLE_SET.has(t)) return t;               // already canonical
  for (const [role, re] of PATTERNS) if (re.test(t)) return role;
  return null;
}

// The canonical role of a scene. Precedence:
//   1. an explicit, valid `role` (stamped by script.normalizeScript)
//   2. coerced from the free-text `purpose`
//   3. coerced from `kind` (storyboard scenes carry kind, not purpose)
//   4. POSITION, when the caller knows it — first scene is a hook, last is a CTA.
//      This is the same rule graph.storyboardFromScript uses, and it is why an
//      unlabelled 2-scene script still gets a sane open/close.
//   5. "feature" — the safest substance default (it keeps the scene eligible for a
//      product visual rather than silently excluding it).
function roleOf(scene, { index, total } = {}) {
  if (!scene) return "feature";
  if (typeof scene.role === "string" && ROLE_SET.has(scene.role)) return scene.role;
  const fromPurpose = coerceRole(scene.purpose);
  if (fromPurpose) return fromPurpose;
  const fromKind = coerceRole(scene.kind);
  if (fromKind) return fromKind;
  if (Number.isFinite(index) && Number.isFinite(total) && total > 1) {
    if (index === 0) return "hook";
    if (index === total - 1) return "cta";
  }
  return "feature";
}

// NOTE: the upstream version of this module also exported `stampRoles`, which wrote
// a canonical `role` onto every scene in place. It is deliberately NOT carried over:
// `role` is already an occupied field name in this branch's composer layer, and
// stamping it would collide. Deriving the role on read (roleOf/isShowcase) gets the
// same benefit with nothing written back to the scene, so `script.js`'s schema is
// untouched and no composer sees a new field.

// The scenes that should carry the product's own visuals (real screenshots, uploads,
// harvested brand imagery). Substance scenes, not the open/close.
const SHOWCASE_ROLES = new Set(["feature", "proof", "how", "context"]);
function isShowcase(scene, opts) { return SHOWCASE_ROLES.has(roleOf(scene, opts)); }

// The showcase target list, with the fallbacks four call sites had each re-derived:
// mid-scenes when nothing is labelled as showcase, and — for a 2-scene script, where
// slice(1,-1) is EMPTY — every scene, so a real screenshot is never silently dropped.
function showcaseTargets(script) {
  const scenes = Array.isArray(script && script.scenes) ? script.scenes : [];
  const showcase = scenes.filter((s, i) => isShowcase(s, { index: i, total: scenes.length }));
  if (showcase.length) return showcase;
  const mid = scenes.slice(1, -1);
  return mid.length ? mid : scenes;
}

module.exports = { ROLES, coerceRole, roleOf, isShowcase, showcaseTargets, SHOWCASE_ROLES };
