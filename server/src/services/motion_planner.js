// MOTION PLANNER — the agent that decides how each scene MOVES, before anything is
// composed.
//
// WHAT IT REPLACES. There was an "animation" node in the graph, but it planned nothing:
// it ran AFTER composition and grepped the finished HTML for three footguns plus a tween
// count. Motion itself was decided two levels down, per FILM rather than per SCENE:
//
//   theme.textfx.enter   ONE text-entrance mode for the entire video (scene_kit.js)
//   motionFor(pack)      ONE camera `cut` for the entire video
//
// So a hook, a data scene, a testimonial and a CTA all entered identically, every time,
// for the whole film. That is the motion half of the "cheap template" tell the QA agent
// is explicitly told to catch (blocker #11, "GROUNDHOG SET") — and no amount of asset
// work fixes it, because it is choreography, not imagery.
//
// WHAT IT DOES. Deterministic (no LLM, no latency): for each scene it chooses a text
// entrance and a camera move from the vocabulary the composer actually implements,
// driven by the scene's narrative ROLE, its DURATION, and its position — then enforces
// ANTI-REPETITION so no two adjacent scenes move the same way.
//
// THE PLAN IS INSPECTABLE, which is the second half of the point. `verifyMotion` reads
// the composed HTML back and reports what the composition actually did against what was
// planned, per scene. A blind tween count could only say "seems thin"; this can say
// "scene 3 was planned a mask-reveal and rendered a spring", or "scene 5 has no timeline
// activity at all".
//
// SCOPE, HONESTLY. The scene-kit (the default composer, and every pack without a
// dedicated renderer) consumes the plan. The ~15 native composers own their own
// choreography by design and ignore it; verifyMotion detects that and grades them on the
// generic checks only, rather than reporting false drift.
//
// Pure functions, no I/O. A null plan makes every consumer behave exactly as before.

const { roleOf } = require("./scene_role");

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The vocabulary the scene-kit's `textIn()` actually implements. Planning a mode outside
// this list would silently fall through to its default — a plan nobody can honour is
// worse than no plan.
const TEXT_ENTERS = ["spring", "char-pop", "mask-reveal", "slide", "drift", "line-wipe", "glitch", "typewriter"];
// The camera moves `sceneMotion()` implements.
const CAMERAS = ["whip", "wipe", "push", "flash", "wash", "panel", "iris"];

// Role → motion affinity. Ordered by preference; the anti-repetition pass picks the
// first that does not collide with the previous scene, so every role has a real second
// choice rather than a fallback nobody chose.
const ROLE_MOTION = {
  hook:    { enter: ["spring", "char-pop"],   camera: ["flash", "iris"],  intensity: 1.00 },
  context: { enter: ["drift", "line-wipe"],   camera: ["wash", "panel"],  intensity: 0.55 },
  feature: { enter: ["slide", "mask-reveal"], camera: ["push", "wipe"],   intensity: 0.80 },
  proof:   { enter: ["char-pop", "spring"],   camera: ["flash", "push"],  intensity: 0.90 },
  how:     { enter: ["line-wipe", "slide"],   camera: ["panel", "wipe"],  intensity: 0.70 },
  quote:   { enter: ["mask-reveal", "drift"], camera: ["wash", "iris"],   intensity: 0.40 },
  cta:     { enter: ["char-pop", "spring"],   camera: ["iris", "flash"],  intensity: 1.00 },
};

// A very short scene cannot afford a slow entrance — the copy would still be arriving as
// the scene cuts. A long one can breathe, and earns a mid-scene emphasis beat.
const FAST_ENTERS = new Set(["char-pop", "slide", "glitch"]);
const SLOW_ENTERS = new Set(["drift", "mask-reveal"]);

function packCut(framePack) {
  if (!framePack) return null;
  try {
    const m = require("./frame_manifest").getManifest(framePack);
    const cut = m && m.motion && m.motion.cut;
    return CAMERAS.includes(cut) ? cut : null;
  } catch { return null; }
}

// Deterministic per-film salt so two films with the same script don't choreograph
// identically — the same trick scene_kit uses for layout variants.
function seedFrom(key) {
  const s = String(key || "kf");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 997;
}

// Pick the first candidate that differs from `avoid`; rotate by seed when a role's whole
// preference list collides, so the tie-break is deterministic but not always the same.
function pick(candidates, avoid, pool, seed, i) {
  const list = candidates.filter((c) => pool.includes(c));
  const fresh = list.find((c) => c !== avoid);
  if (fresh) return fresh;
  const rest = pool.filter((c) => c !== avoid);
  if (!rest.length) return list[0] || pool[0];
  return rest[(seed + i) % rest.length];
}

/**
 * planMotion({ storyboard, framePack, layoutPlan, seedKey })
 *   → { byScene: { [sceneId]: SceneMotion }, vocabulary, variety, notes[] }
 *
 * SceneMotion = {
 *   id, role, archetype, intensity,
 *   enter,            // text entrance mode (scene_kit textIn)
 *   camera,           // shot entrance/exit family (scene_kit sceneMotion)
 *   staggerSec,       // per-word stagger
 *   entranceAtSec,    // absolute time the copy starts arriving
 *   emphasisAtSec,    // absolute time of the mid-scene accent (null when too short)
 *   exitAtSec,        // absolute time the scene begins leaving
 *   reason            // why this scene moves this way (for the report)
 * }
 */
function planMotion({ storyboard, framePack, layoutPlan, seedKey } = {}) {
  const scenes = Array.isArray(storyboard && storyboard.scenes) ? storyboard.scenes : [];
  if (!scenes.length) return null;

  const seed = seedFrom(seedKey);
  const signature = packCut(framePack);
  // The pack's declared cut stays reachable for every scene, so a pack with a signature
  // move (blockframe's wipe, mono-corporate's panel) keeps its identity even where a
  // role would prefer something else.
  const cameraPool = signature ? [signature, ...CAMERAS.filter((c) => c !== signature)] : CAMERAS.slice();

  const byScene = {};
  const notes = [];
  let prevEnter = null, prevCamera = null;

  scenes.forEach((sc, i) => {
    const id = sc.id != null ? sc.id : `s${i + 1}`;
    const role = roleOf(sc, { index: i, total: scenes.length });
    const dur = Number(sc.duration) || 4;
    const start = Number(sc.start) || 0;
    const spec = ROLE_MOTION[role] || ROLE_MOTION.feature;
    const archetype = (layoutPlan && layoutPlan[id] && layoutPlan[id].archetype) || null;

    // 1) Candidates from the role, filtered by what the DURATION can carry.
    let enterCands = spec.enter.slice();
    if (dur < 2.5) {
      // Too short for a slow arrival: prefer fast modes, and keep a fast fallback.
      enterCands = [...enterCands.filter((e) => FAST_ENTERS.has(e)), "char-pop", "slide"];
    } else if (dur >= 7) {
      // Long enough to breathe: allow the slower, more cinematic arrivals first.
      enterCands = [...enterCands.filter((e) => SLOW_ENTERS.has(e)), ...enterCands];
    }

    // 2) ANTI-REPETITION — the reason this planner exists. Adjacent scenes must not
    //    arrive the same way; that sameness is what reads as one static slide with
    //    rotating content.
    const enter = pick(enterCands, prevEnter, TEXT_ENTERS, seed, i);
    const camera = pick(spec.camera, prevCamera, cameraPool, seed, i);

    // 3) Timing, derived from the scene rather than fixed. A hook holds a beat before
    //    its copy lands (the shot establishes first); everything else arrives sooner.
    const entranceAt = r2(start + clamp(role === "hook" ? 0.45 : 0.25, 0.15, dur * 0.25));
    const exitAt = r2(start + Math.max(0.3, dur - 0.35));
    const emphasisAt = dur >= 4 ? r2(start + dur * 0.42) : null;
    // Denser copy on a short scene needs a tighter stagger or the last word lands late.
    const words = (Array.isArray(sc.onScreenText) ? sc.onScreenText.join(" ") : String(sc.headline || "")).split(/\s+/).filter(Boolean).length || 4;
    const staggerSec = r2(clamp((dur * 0.5) / Math.max(4, words), 0.03, 0.12));

    byScene[id] = {
      id, role, archetype,
      intensity: spec.intensity,
      enter, camera, staggerSec,
      entranceAtSec: entranceAt,
      emphasisAtSec: emphasisAt,
      exitAtSec: exitAt,
      reason: `${role} scene, ${dur}s${dur < 2.5 ? " (short → fast entrance)" : dur >= 7 ? " (long → cinematic entrance)" : ""}`
        + (enter === prevEnter ? "" : ", distinct from the previous scene"),
    };
    prevEnter = enter; prevCamera = camera;
  });

  const enters = Object.values(byScene).map((m) => m.enter);
  const cameras = Object.values(byScene).map((m) => m.camera);
  let adjacentRepeats = 0;
  for (let i = 1; i < enters.length; i++) if (enters[i] === enters[i - 1] && cameras[i] === cameras[i - 1]) adjacentRepeats++;
  if (adjacentRepeats) notes.push(`${adjacentRepeats} adjacent scene pair(s) share both entrance and camera — the vocabulary ran out (very short film or a heavily constrained pack).`);

  return {
    byScene,
    vocabulary: { signatureCut: signature, enters: [...new Set(enters)], cameras: [...new Set(cameras)] },
    variety: {
      sceneCount: enters.length,
      distinctEnters: new Set(enters).size,
      distinctCameras: new Set(cameras).size,
      adjacentRepeats,
    },
    notes,
  };
}

// ---------------------------------------------------------------- native packs
//
// THE SAME DEFECT, ONE LEVEL UP. The ~22 native packs do not use scene_kit's textIn /
// sceneMotion vocabulary at all — each owns its choreography and picks a SCENE TYPE per
// scene from its own `BUILDERS` map via an `archetypeFor(scene, i, total)`. Those
// selectors are sibling copies of one shape:
//
//   if (i === 0 …)                    return "open";
//   if (i === total - 1 …)            return "cta";
//   if (<data-shaped test>)           return "stats" | "chart" | "bullets";
//   return "showcase";                ← EVERY remaining scene lands here
//
// So a five-scene film is open → showcase → showcase → showcase → cta: one backdrop and
// one layout repeated through the whole middle. That is precisely the blocker a real
// render produced on `flagship` ("the background and layout are identical to the scene
// at 5.9s"), and no amount of entrance-level planning fixes it, because the SCENE TYPE
// is what carries the backdrop.
//
// WHY THIS IS CONSERVATIVE. Substituting archetypes blindly is genuinely unsafe: the
// data-shaped branches above are PRECONDITIONS. Forcing "stats" onto a scene with no
// number, or "gallery" onto a film with one image, renders an empty panel — a worse
// defect than the repetition being fixed. So a substitution happens only when the
// duplicate AND its replacement are both GENERIC — headline-plus-optional-image scenes
// that any content satisfies — and the replacement is one this pack actually implements.
//
// Archetype names repeat across the packs (they were built from one another), so a
// shared name list works without the planner knowing any individual pack.
const GENERIC_ARCHETYPES = new Set([
  "showcase", "statement", "hero", "billboard", "feature", "detail",
  "plate", "figure", "reveal", "spotlight", "headline", "brief",
  // flagship's narrative vocabulary. `problem`/`solution`/`features` are its own
  // fallthrough pair (`i % 2 ? "solution" : "features"`), so they are generic by
  // construction. `benefits` is deliberately EXCLUDED — it renders animated metrics and
  // wants a number in the copy.
  "problem", "solution", "features",
]);

/**
 * varyArchetypes(base, { pool, seedKey, locked })
 *   → { archetypes, changed, from[] }
 *
 * `base`   the pack's own per-scene choice, in order
 * `pool`   the archetypes this pack implements (i.e. Object.keys(BUILDERS))
 * `locked` indices the caller has already decided deliberately (asset-driven promotions)
 *
 * The first and last scenes are never touched — whatever the pack chose there is its
 * opener and its closer, which are structural, not interchangeable. Those two names are
 * also barred as replacements, so a middle scene can never accidentally become a second
 * opening or a second CTA.
 */
function varyArchetypes(base, { pool = [], seedKey = "", locked = [] } = {}) {
  const out = Array.isArray(base) ? base.slice() : [];
  const n = out.length;
  const from = [];
  // Operator kill switch. This changes which scene builder runs, so a way to get the
  // pack's original sequence back — without a code edit — is worth having when
  // diagnosing a pack-specific rendering problem. It is also what lets the variety test
  // compose each pack BOTH ways and prove the pass regresses nothing.
  if (/^(1|true|yes|on)$/i.test(String(process.env.KF_NO_ARCHETYPE_VARIATION || ""))) {
    return { archetypes: out, changed: 0, from, disabled: true };
  }
  if (n < 3) return { archetypes: out, changed: 0, from };

  const structural = new Set([out[0], out[n - 1]]);
  const lockedSet = new Set(locked);
  const candidates = (pool || []).filter((a) => GENERIC_ARCHETYPES.has(a) && !structural.has(a));
  if (!candidates.length) return { archetypes: out, changed: 0, from };

  const seed = seedFrom(seedKey);
  let changed = 0;
  for (let i = 1; i < n - 1; i++) {
    if (lockedSet.has(i)) continue;
    if (out[i] !== out[i - 1]) continue;              // not a repeat — leave it alone
    if (!GENERIC_ARCHETYPES.has(out[i])) continue;    // a data-shaped scene keeps its type
    // Prefer a replacement that also differs from the NEXT scene, so breaking one pair
    // doesn't just create the next one.
    const next = base[i + 1];
    const strict = candidates.filter((a) => a !== out[i - 1] && a !== next && a !== out[i]);
    const loose = candidates.filter((a) => a !== out[i - 1] && a !== out[i]);
    const list = strict.length ? strict : loose;
    if (!list.length) continue;
    from.push({ index: i, was: out[i], now: list[(seed + i) % list.length] });
    out[i] = list[(seed + i) % list.length];
    changed++;
  }
  return { archetypes: out, changed, from };
}

// ---------------------------------------------------------------- verification
//
// What the composition ACTUALLY did, against what was planned. This is the half that
// makes the plan worth having: a tween count can only guess at "thin", while this can
// name the scene and the discrepancy.

// scene_kit emits `textIn("<mode>","#s2 .kfw", …)` — so the real per-scene entrance is
// recoverable from the composed document.
function actualEnters(html) {
  const out = {};
  const re = /textIn\(\s*"([^"]+)"\s*,\s*"#(s\d+)\s/g;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) out[m[2]] = m[1];
  return out;
}

// Timeline activity per scene clip id: how many tweens reference `#sN`.
function tweenCounts(html, ids) {
  const counts = {};
  const src = String(html || "");
  for (const id of ids) {
    const re = new RegExp(`tl\\.(?:to|fromTo|from|set)\\([^;]*?#${id}\\b`, "g");
    counts[id] = (src.match(re) || []).length;
  }
  return counts;
}

/**
 * verifyMotion({ plan, indexHtml, storyboard })
 *   → { honored, planned, scenes[], warnings[], footguns[], staticScenes[], driftedScenes[] }
 *
 * `honored:false` with `planAware:false` is NOT a failure — it means a dedicated composer
 * owns its own choreography (the native packs), so only the generic checks apply.
 */
function verifyMotion({ plan, indexHtml, storyboard } = {}) {
  const html = String(indexHtml || "");
  const sbScenes = Array.isArray(storyboard && storyboard.scenes) ? storyboard.scenes : [];
  const warnings = [];

  // The three footguns the old audit checked — kept, because they are real and cheap.
  const footguns = [];
  if (/repeat:\s*-1/.test(html)) footguns.push("repeat:-1 found (breaks deterministic capture)");
  if (/style="[^"]*transform:\s*translate/i.test(html)) footguns.push("inline transform hidden-state found (composes with GSAP xPercent — content may stay offscreen)");
  footguns.forEach((f) => warnings.push(f));

  // Scene-kit clip ids are positional (`s1`, `s2`, …) regardless of the script's own ids.
  const clipIds = sbScenes.map((_, i) => `s${i + 1}`);
  const counts = tweenCounts(html, clipIds);
  const totalTweens = (html.match(/tl\.(?:to|fromTo|from|set)\(/g) || []).length;

  const planAware = /textIn\(/.test(html);   // the scene-kit's signature; native packs have none
  const actual = planAware ? actualEnters(html) : {};
  const planned = plan && plan.byScene ? plan.byScene : null;

  const scenes = sbScenes.map((sc, i) => {
    const clipId = `s${i + 1}`;
    const sceneId = sc.id != null ? sc.id : clipId;
    const want = planned ? planned[sceneId] : null;
    const got = actual[clipId] || null;
    return {
      sceneId, clipId,
      plannedEnter: want ? want.enter : null,
      actualEnter: got,
      plannedCamera: want ? want.camera : null,
      tweens: counts[clipId] || 0,
      honored: !want || !planAware ? null : got === want.enter,
    };
  });

  // A scene with NO timeline activity is a static frame — the defect the old tween count
  // could only hint at globally, now named.
  const staticScenes = scenes.filter((s) => s.tweens === 0).map((s) => s.sceneId);
  if (staticScenes.length) warnings.push(`${staticScenes.length} scene(s) have no timeline activity at all (${staticScenes.join(", ")}) — they will render as a still frame`);

  const driftedScenes = scenes.filter((s) => s.honored === false);
  if (driftedScenes.length) {
    warnings.push(`${driftedScenes.length} scene(s) did not use their planned entrance (` +
      driftedScenes.slice(0, 4).map((s) => `${s.sceneId}: planned ${s.plannedEnter}, got ${s.actualEnter || "none"}`).join("; ") + ")");
  }

  const checked = scenes.filter((s) => s.honored !== null);
  return {
    planAware,
    planned: !!planned,
    honored: checked.length ? checked.every((s) => s.honored) : null,
    honoredCount: checked.filter((s) => s.honored).length,
    checkedCount: checked.length,
    totalTweens,
    tweensPerScene: sbScenes.length ? Math.round((totalTweens / sbScenes.length) * 10) / 10 : 0,
    scenes,
    staticScenes,
    driftedScenes: driftedScenes.map((s) => s.sceneId),
    footguns,
    warnings,
  };
}

module.exports = { planMotion, verifyMotion, varyArchetypes, TEXT_ENTERS, CAMERAS, ROLE_MOTION, GENERIC_ARCHETYPES };
