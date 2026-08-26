// FILM AUTHOR — generate a whole animated template, not a skin.
//
// HOW THIS DIFFERS FROM template_generator.js, AND WHY BOTH EXIST.
//
// template_generator emits a VARIANT: a palette, two font names and a label, laid
// over one of the existing hand-built renderer families. Its prompt says, in so
// many words, "you do not write code". That is the right tool when the studio
// wants another look on machinery it already trusts, and it is cheap.
//
// This module is the other half: the admin describes a niche and gets a FILM —
// its own animated SVG world, its own scene components, its own motion
// vocabulary. The model writes the JSX; `admin/film_bundle.js` compiles it with
// Babel and wraps it in the same self-contained __bundler page the 28 shipped
// long-form templates use, so the result renders through the omelette path with
// no new engine and no new composer.
//
// The two are NOT interchangeable and must not share a prompt: the variant path
// validates a fixed eleven-field object, so pointing it at the film prompt would
// make every generation fail validation with the model having done nothing wrong.
// The prompt lives in prompts/system_film_author.md and carries its own output
// contract (§12) describing exactly the JSON this file parses.
//
// FAIL LOUD, NOT HALFWAY. A film that compiles but declares no scenes, or blows
// the engine's 50-scene / 16KB budget, renders an error slate for its whole
// length — indistinguishable from a black video. Everything checkable is checked
// here, before a bundle is written.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");
const { buildBundle, checkBundleTarget, templateIdFor, ETPLCOLLISION } = require("../admin/film_bundle");

const STAGE = "film_author";
const SYSTEM = fs.readFileSync(path.join(__dirname, "..", "prompts", "system_film_author.md"), "utf8");

// The engine's own ceilings (animations-v2.jsx rejects either outright).
const MAX_SCENES = 50;
const MAX_SCENES_BYTES = 16 * 1024;

const cfg = () => ({ enabled: true, model: null, ...(config.filmAuthor || {}) });

/** Every reason this spec could not become a film. Empty array = usable. */
function validateFilmSpec(spec, { durationSec } = {}) {
  const bad = [];
  if (!spec || typeof spec !== "object") return ["reply was not a JSON object"];

  const id = String(spec.templateId || "");
  if (!/^[A-Z][A-Za-z0-9]{2,40}$/.test(id)) bad.push(`templateId ${JSON.stringify(id)} must be PascalCase, 3-41 chars`);

  const src = String(spec.filmSource || "");
  if (src.length < 400) bad.push("filmSource is missing or too short to be a film");
  // The bundle mounts the film by reading window.<templateId>; without that
  // assignment the page loads, renders nothing, and reports no error at all.
  if (id && !new RegExp(`window\\.${id}\\s*=`).test(src)) bad.push(`filmSource never assigns window.${id}`);
  if (/\bimport\s+.*\bfrom\b|\bexport\s+(default|const|function)/.test(src)) {
    bad.push("filmSource uses ESM import/export — it is compiled as a classic-runtime script");
  }
  // OM_SCENES is rewritten per film by the adapter; a film that hardcodes its own
  // scene list ignores the studio's copy entirely.
  if (!/OM_SCENES/.test(src)) bad.push("filmSource never reads window.OM_SCENES");

  const scenes = spec.scenes;
  if (!Array.isArray(scenes) || !scenes.length) bad.push("scenes must be a non-empty array");
  else {
    if (scenes.length > MAX_SCENES) bad.push(`${scenes.length} scenes exceeds the engine's ${MAX_SCENES}-scene cap`);
    const noName = scenes.findIndex((s) => !s || !String(s.name || "").trim());
    if (noName >= 0) bad.push(`scene ${noName} has no "name" (it selects the component from SCENE_MAP)`);
    const noDur = scenes.findIndex((s) => !(Number(s && s.dur) > 0));
    if (noDur >= 0) bad.push(`scene ${noDur} has no positive "dur"`);
    const bytes = JSON.stringify(scenes).length;
    if (bytes > MAX_SCENES_BYTES) bad.push(`serialized scenes are ${bytes}B, over the engine's ${MAX_SCENES_BYTES}B cap`);
    // A straight apostrophe terminates the single-quoted JS string the scene list
    // lives in — the film then fails to mount with no other symptom.
    const apos = scenes.findIndex((s) => Object.values(s || {}).some((v) => typeof v === "string" && /'/.test(v)));
    if (apos >= 0) bad.push(`scene ${apos} contains a straight apostrophe — use ’`);
    if (durationSec) {
      const total = scenes.reduce((a, s) => a + (Number(s.dur) || 0), 0);
      // 15% is the band where the adapter's own beat-fitting absorbs the drift.
      if (Math.abs(total - durationSec) > durationSec * 0.15) {
        bad.push(`scenes sum to ${Math.round(total)}s but ${durationSec}s was requested`);
      }
    }
  }

  const w = Number(spec.width), h = Number(spec.height);
  if (!(w > 0 && h > 0)) bad.push("width/height must be positive numbers");
  return bad;
}

/**
 * Author one film and write its bundle.
 *
 * @param {object} o
 * @param {string} o.brief       what the admin asked for (niche, tone, audience)
 * @param {string} [o.slug]      desired pack slug; the templateId is derived when absent
 * @param {number} [o.durationSec]
 * @param {string} [o.orientation] "horizontal" | "vertical" | "square"
 * @returns {Promise<{ok:boolean, spec?:object, file?:string, bytes?:number, problems?:string[]}>}
 */
async function authorFilm({ brief, slug = "", durationSec = 300, orientation = "horizontal", tracker, signal } = {}) {
  if (!String(brief || "").trim()) return { ok: false, problems: ["no brief given"] };

  // CHECK THE NAME BEFORE SPENDING ON THE FILM. The collision is a property of
  // the slug alone, so discovering it after the model has authored a whole film
  // means paying for a frontier-model generation and throwing it away — twice,
  // since the repair lap would collide identically.
  if (slug) {
    try { checkBundleTarget({ templateId: templateIdFor(slug), owner: slug }); }
    catch (e) { return { ok: false, problems: [String((e && e.message) || e)] }; }
  }

  const canvas = orientation === "vertical" ? { width: 1080, height: 1920 }
    : orientation === "square" ? { width: 1080, height: 1080 }
    : { width: 1920, height: 1080 };

  const user = [
    `NICHE / BRIEF: ${String(brief).trim()}`,
    slug ? `SLUG: ${slug} (templateId should be its PascalCase form, e.g. ${templateIdFor(slug)})` : "",
    `CANVAS: ${canvas.width} x ${canvas.height} (${orientation}) — compose FOR it, do not scale another layout into it.`,
    `TARGET RUNTIME: ${durationSec}s. State it, then make the dur fields sum to it.`,
    "",
    "Return the JSON object described in section 12. Nothing else.",
  ].filter(Boolean).join("\n");

  const problems = [];
  let last = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (signal?.aborted) return { ok: false, problems: ["cancelled"] };
    // The repair lap is COLD and is handed the exact violations: a model that has
    // already invented the film should be transcribing corrections, not starting
    // over with a different palette and a different world.
    const suffix = attempt === 1 ? "" :
      `\n\nYour previous reply could not be built. Fix EXACTLY these and return the whole object again:\n- ${problems.join("\n- ")}`;
    try {
      const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
        system: SYSTEM,
        user: user + suffix,
        jsonMode: true,
        stage: STAGE,
        model: cfg().model || undefined,
        temperature: attempt === 1 ? 0.7 : 0.2,
        signal,
      });
      if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: STAGE, costUsd });

      const spec = extractFirstJsonObject(text);
      last = spec;
      problems.length = 0;
      problems.push(...validateFilmSpec(spec, { durationSec }));
      if (problems.length) { console.warn(`[film_author] attempt ${attempt}: ${problems.length} problem(s) — ${problems[0]}`); continue; }

      // Only now is it safe to compile: buildBundle throws on a Babel syntax
      // error, which is the one failure the checks above cannot see.
      const built = buildBundle({
        templateId: spec.templateId,
        filmSource: spec.filmSource,
        scenes: spec.scenes,
        tweaks: spec.tweaks || {},
        fonts: Array.isArray(spec.fonts) ? spec.fonts : [],
        width: Number(spec.width) || canvas.width,
        height: Number(spec.height) || canvas.height,
        // OWNERSHIP IS THE PACK, NOT THE ID THE MODEL PICKED. buildBundle refuses
        // to overwrite a template this pack does not own, and templateId is a
        // lossy function of the slug — two slugs can produce one PascalCase id,
        // and the model is free to return an id of its own choosing. Stamping the
        // slug means a re-author of THIS pack replaces its own film while any
        // other collision is refused instead of quietly destroying a template.
        owner: slug || spec.templateId,
      });
      console.log(`[film_author] ${spec.templateId}: ${spec.scenes.length} scenes, ${Math.round(built.bytes / 1024)}KB bundle -> ${built.file}`);
      return { ok: true, spec, file: built.file, bytes: built.bytes };
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 200);
      console.warn(`[film_author] attempt ${attempt} failed: ${msg}`);
      problems.length = 0;
      problems.push(msg);
      // A name collision is not something the model can fix — the second lap
      // would author another film against the same taken name and be refused
      // again, for the price of a second generation. Stop here.
      if (e && e.code === ETPLCOLLISION) break;
    }
  }
  return { ok: false, spec: last, problems: problems.slice() };
}

module.exports = { authorFilm, validateFilmSpec, MAX_SCENES, MAX_SCENES_BYTES };
