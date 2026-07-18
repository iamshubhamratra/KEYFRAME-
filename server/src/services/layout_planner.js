// Layout Planner — deterministic (pure-JS) per-scene ARCHETYPE typing, run between
// Creative Direction and Composition. The scene-kit's asset WEAVING is already
// asset-aware (it places the screenshot on the best-fit scene, montages a deep
// pool, splits the rest), so this planner deliberately does NOT re-decide asset
// placement. Instead it fixes the part that is still asset-/content-blind: the
// BASE archetype of each scene.
//
// Today `archetypeFor` keys almost entirely off `scene.kind` + a number check, so
// a testimonial written as a plain "bullet" renders as generic text, a metric with
// no `kind:"chart"` misses the stat card, and a closing scene that isn't tagged
// `cta` gets no call-to-action treatment. The planner reads each scene's PURPOSE +
// on-screen TEXT to type it correctly, emitting a hint that `archetypeFor` honors.
//
// It only ever selects among the ASSET-FREE archetypes (hook / stat / quote / text
// / cta) — the asset archetypes (hero / montage / split) stay owned by the weaving,
// which feeds them their assets. So a hint can never leave a scene demanding an
// asset it never receives. Pure functions, no LLM, no I/O — free and deterministic.

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// The archetype names the planner may emit — MUST match archetypeFor's mapping.
const ARCHS = new Set(["hook", "stat", "quote", "text", "cta"]);

// Does the scene carry a strong standalone number/metric worth a stat card?
// Mirrors the intent of scene_kit's pickNumber but works off script/storyboard
// text (headline + on-screen text) without needing the kit's internals.
const STAT_RE = /(\$|₹|€|£)?\s?\d[\d,.]*\s?(%|percent|x\b|k\b|m\b|bn?\b|billion|million|thousand|\+|users|customers|hours|days|mins?|seconds|stars|reviews|countries)/i;
const PURE_NUM_RE = /^\s*[^\d]{0,12}\d[\d,.]*\s?(%|x|k|m|\+)?\s*$/i;

// Testimonial / quotation cues → a pull-quote card.
const QUOTE_RE = /["“”].{8,}["“”]|\b(said|says|according to|testimonial|review)\b|—\s*[A-Z][a-z]+/;

// Call-to-action cues → the CTA close.
const CTA_RE = /\b(get started|sign up|try (it|now|free)|download|join|subscribe|start (your|free)|book (a )?demo|learn more|visit|shop now|buy now|today|get yours|claim)\b/i;

function sceneText(scene) {
  const ost = Array.isArray(scene.onScreenText) ? scene.onScreenText.join(" ") : "";
  return `${scene.headline || ""} ${scene.subtext || ""} ${ost} ${scene.visualDirection || ""}`.trim();
}

// Decide the archetype for one scene from its position, purpose/kind, and text.
// Returns one of ARCHS. The ordering mirrors archetypeFor's precedence so the
// planner never fights the kit's own hard rules (hook first, cta last).
function archetypeForScene(scene, idx, total) {
  const kind = String(scene.kind || "").toLowerCase();
  const purpose = String(scene.purpose || "").toLowerCase();
  const text = sceneText(scene);

  if (idx === 0 || kind === "hook" || kind === "title" || purpose === "hook") return "hook";
  if (idx === total - 1 || kind === "cta" || purpose === "cta" || (idx >= total - 1 && CTA_RE.test(text))) return "cta";
  if (kind === "quote" || purpose === "proof" && QUOTE_RE.test(text) || QUOTE_RE.test(text)) return "quote";
  if (kind === "chart" || kind === "countdown" || PURE_NUM_RE.test(text) || (STAT_RE.test(text) && text.length <= 90)) return "stat";
  return "text";
}

// Build the layout plan: { [sceneId]: { archetype, reason } }. Consumed by
// scene_kit.archetypeFor (via buildComposition's `layoutPlan`). Fail-open by
// construction — a malformed storyboard yields an empty plan and the kit falls
// back to its own archetypeFor logic.
function planLayout({ storyboard, script } = {}) {
  const sb = storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length
    ? storyboard
    : (script && Array.isArray(script.scenes) ? script : null);
  const scenes = sb ? sb.scenes : [];
  const total = scenes.length;
  const plan = {};
  const counts = {};
  scenes.forEach((scene, i) => {
    const id = scene && scene.id != null ? scene.id : `s${i + 1}`;
    let arch = archetypeForScene(scene || {}, i, total);
    if (!ARCHS.has(arch)) arch = "text";
    plan[id] = { archetype: arch, reason: `purpose=${scene && scene.purpose || "?"} kind=${scene && scene.kind || "?"}` };
    counts[arch] = (counts[arch] || 0) + 1;
  });
  // Guardrail (Hyperframe "sparse rule, one dense exception"): if EVERY interior
  // scene typed as a stat, that's a wall of number cards. Keep at most a third of
  // interior scenes as stats; demote the weakest-signal extras back to text so the
  // film breathes. Interior = not the hook/cta.
  const interior = scenes.map((s, i) => ({ s, i })).filter(({ i }) => i > 0 && i < total - 1);
  const statCap = Math.max(1, Math.round(interior.length / 3));
  const statScenes = interior.filter(({ s, i }) => {
    const id = s && s.id != null ? s.id : `s${i + 1}`;
    return plan[id] && plan[id].archetype === "stat";
  });
  if (statScenes.length > statCap) {
    // Keep the strongest (shortest, most number-like) stat scenes; demote the rest.
    statScenes
      .sort((a, b) => sceneText(a.s).length - sceneText(b.s).length)
      .slice(statCap)
      .forEach(({ s, i }) => {
        const id = s && s.id != null ? s.id : `s${i + 1}`;
        plan[id] = { archetype: "text", reason: "stat-cap: demoted to text so the film isn't all number cards" };
      });
  }
  return plan;
}

module.exports = { planLayout, archetypeForScene };
