// CONTINUITY — one authority that guarantees the storyboard describes the SAME FILM
// the user approved.
//
// THE PROBLEM THIS SOLVES. Scenes are authored twice. The script (Act 1) is validated,
// user-editable, and approved — it is the source of truth. Then the storyboard (Act 2)
// REGENERATES scenes from a prose digest of that script, and nothing checked the
// result. The two disagree by construction:
//
//   script.js      duration ∈ [1, 12]      (SceneSchema)
//   storyboard.js  duration ∈ [2, 15], then EVERY duration is RESCALED to hit the
//                  target total (normalizeTimeline)
//
// So a 1.5 s script scene becomes 2 s, every later scene shifts, and the two timelines
// silently diverge. That matters because the pipeline reads DIFFERENT ones:
//
//   script timings  → voiceover offsets, SFX cues, caption cues, QA frame sampling,
//                     asset startSec/durationSec
//   storyboard      → the actual composition (every composer lays out sb.scenes)
//
// The audible result is a voiceover that drifts out from under its visuals, captions
// that land on the wrong scene, and a QA agent sampling frames at moments that no
// longer correspond to the scene plan it is shown.
//
// THE RULE. The approved script owns STRUCTURE (which scenes exist, in what order,
// with what ids and timings). The storyboard owns ENRICHMENT (kind, animation, motif,
// emphasis, beats, headline/subtext). Reconciliation keeps the model's creative work
// and re-imposes the user's structure on top of it — deterministically, no LLM.
//
// Pure + fail-open: on any malformed input it returns the storyboard untouched with a
// report explaining why, and never throws.

const { roleOf } = require("./scene_role");

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const isNum = (n) => Number.isFinite(Number(n));

// The enrichment fields the storyboard legitimately owns. Everything else on a
// reconciled scene comes from the script.
const ENRICHMENT = [
  "kind", "animation", "headline", "subtext", "onScreenText", "emphasis",
  "visualMotif", "beats", "palette", "camera", "layout", "archetype", "kicker",
];

// A minimal storyboard scene derived from a script scene — used when the model
// returned fewer scenes than the script has. Mirrors graph.storyboardFromScript's
// defaults so a synthesized scene is indistinguishable from a fallback one.
function shellFor(scriptScene, index, total) {
  const role = roleOf(scriptScene, { index, total });
  const kind = role === "hook" ? "hook"
    : role === "cta" ? "cta"
      : role === "quote" ? "quote"
        : role === "proof" ? "stat"
          : "bullet";
  const animation = kind === "hook" ? "spring"
    : kind === "cta" ? "char-pop"
      : kind === "quote" ? "mask-reveal"
        : "drift";
  const ost = Array.isArray(scriptScene.onScreenText) ? scriptScene.onScreenText.slice(0, 4) : [];
  const words = String(scriptScene.voiceover || "").trim().split(/\s+/).filter(Boolean);
  return {
    kind, animation,
    headline: String(ost[0] || words.slice(0, 6).join(" ") || scriptScene.purpose || "").slice(0, 80),
    subtext: ost[1] ? String(ost[1]).slice(0, 80) : "",
    onScreenText: ost,
    emphasis: "",
    beats: [],
  };
}

/**
 * reconcileStoryboard({ storyboard, script })
 *   → { storyboard, report }
 *
 * `report` is disclosure-shaped and safe to persist:
 *   { ok, changed, sceneCount:{script,storyboard}, retimed, renamed, synthesized,
 *     dropped, maxDriftSec, notes[] }
 *
 * `ok:true` means the storyboard already matched (the common case — the reconciliation
 * is then a no-op and the object is returned untouched).
 */
function reconcileStoryboard({ storyboard, script } = {}) {
  const empty = { ok: true, changed: false, retimed: 0, renamed: 0, synthesized: 0, dropped: 0, maxDriftSec: 0, notes: [] };
  const scriptScenes = Array.isArray(script && script.scenes) ? script.scenes : [];
  if (!storyboard || !Array.isArray(storyboard.scenes) || !scriptScenes.length) {
    return { storyboard, report: { ...empty, notes: ["reconciliation skipped: missing script or storyboard scenes"] } };
  }

  const sbScenes = storyboard.scenes;
  const byId = new Map();
  for (const sc of sbScenes) if (sc && sc.id != null) byId.set(String(sc.id), sc);

  const notes = [];
  let retimed = 0, renamed = 0, synthesized = 0, maxDrift = 0;
  const used = new Set();

  const reconciled = scriptScenes.map((src, i) => {
    // Pair by id first (the model usually echoes them), else by position — the script
    // digest hands the model the scenes IN ORDER, so index is a sound second key.
    let sb = src.id != null ? byId.get(String(src.id)) : null;
    if (sb && used.has(sb)) sb = null;
    if (!sb) {
      const positional = sbScenes[i];
      if (positional && !used.has(positional)) { sb = positional; if (src.id != null && String(positional.id) !== String(src.id)) renamed++; }
    }
    if (!sb) {
      synthesized++;
      sb = shellFor(src, i, scriptScenes.length);
    } else {
      used.add(sb);
    }

    // Keep ONLY the enrichment the model authored; structure comes from the script.
    const out = {};
    for (const k of ENRICHMENT) if (sb[k] !== undefined) out[k] = sb[k];
    // Anything else the model invented (motifs a composer may read) rides along, minus
    // the structural fields we are about to own.
    for (const [k, v] of Object.entries(sb)) {
      if (k === "id" || k === "start" || k === "duration" || k === "voiceover" || k === "purpose" || k === "role") continue;
      if (out[k] === undefined) out[k] = v;
    }

    const drift = Math.abs(Number(sb.start ?? src.start) - Number(src.start))
      + Math.abs(Number(sb.duration ?? src.duration) - Number(src.duration));
    if (isNum(sb.start) && isNum(sb.duration) && drift > 0.05) { retimed++; maxDrift = Math.max(maxDrift, drift); }

    // Structure — the approved script's, verbatim.
    out.id = src.id != null ? src.id : `s${i + 1}`;
    out.start = r2(src.start);
    out.duration = r2(src.duration);
    out.purpose = src.purpose || out.purpose || "";
    out.role = roleOf(src, { index: i, total: scriptScenes.length });
    // The VOICEOVER is the user's approved line; a storyboard paraphrase must never
    // reach a composer that renders it as on-screen copy.
    out.voiceover = typeof src.voiceover === "string" ? src.voiceover.trim().slice(0, 400) : "";
    // Ensure a scene always carries copy: prefer the model's headline, fall back to the
    // script's own on-screen text.
    if (!out.headline) {
      const ost = Array.isArray(src.onScreenText) ? src.onScreenText.filter(Boolean) : [];
      out.headline = String(ost[0] || "").slice(0, 80);
    }
    if (!Array.isArray(out.onScreenText) || !out.onScreenText.length) {
      out.onScreenText = Array.isArray(src.onScreenText) ? src.onScreenText.slice(0, 4) : [];
    }
    return out;
  });

  const dropped = sbScenes.length - used.size;
  const total = r2(scriptScenes.reduce((a, s) => a + Number(s.duration || 0), 0));

  if (retimed) notes.push(`${retimed} scene(s) had storyboard timing that diverged from the approved script (max ${r2(maxDrift)}s) — the script's timing was restored, so voiceover, captions and QA sampling stay aligned with the picture.`);
  if (renamed) notes.push(`${renamed} scene(s) came back with different ids and were re-paired by position.`);
  if (synthesized) notes.push(`${synthesized} scene(s) were missing from the storyboard and were derived from the script.`);
  if (dropped > 0) notes.push(`${dropped} extra storyboard scene(s) were dropped — the approved script defines the film's scene list.`);

  const changed = retimed > 0 || renamed > 0 || synthesized > 0 || dropped > 0
    || sbScenes.length !== reconciled.length;

  const out = { ...storyboard, scenes: reconciled, durationSec: total };
  return {
    storyboard: changed ? out : { ...storyboard, scenes: reconciled, durationSec: total },
    report: {
      ok: !changed,
      changed,
      sceneCount: { script: scriptScenes.length, storyboard: sbScenes.length },
      retimed, renamed, synthesized, dropped,
      maxDriftSec: r2(maxDrift),
      notes,
    },
  };
}

module.exports = { reconcileStoryboard, shellFor };
