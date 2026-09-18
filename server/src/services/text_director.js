// Text Director agent — the copy authority between Scene Planning and
// Composition. The storyboard model routinely ships scenes that are just a
// headline (subtext/bullets/emphasis empty), so films read text-thin even
// though the BRIEF and SCRIPT are full of sellable words: stats ("12k films"),
// feature names, proof points, quotes, CTAs, and the site's own key messages.
// The Text Director mines those sources and INJECTS the important text into
// the storyboard scenes the composition actually renders:
//   subtext  — one supporting line under the headline        (scene_kit <p>)
//   bullets  — up to 3 short points (feature grid / strike list / hero callout
//              chips all draw from scene.bullets)
//   emphasis — the ONE word of the headline to highlight (must be a substring)
//   kicker   — a tiny chip label above the headline
//
// ADD-ONLY by design: it never overwrites text a scene already carries — the
// storyboard model's choices win; the Director only fills the empty slots. So
// the worst case is exactly the film we ship today, never a worse one.
//
// FAIL-OPEN by design (mirrors art_director / audio_director): disabled, LLM
// error, or junk reply → the deterministic miner still fills gaps from
// script.onScreenText + brief.keyMessages; if even that finds nothing the
// storyboard passes through untouched. It can never block a render.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const openrouter = require("./openrouter");
const pacing = require("./pacing");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_text_director.md"),
  "utf8"
);

function tdr() {
  return config.textDirector || { enabled: true, model: config.llm.modelFast || config.llm.model };
}

// ---- sanitization ------------------------------------------------------------
// Word-boundary safe. A raw slice cut lines mid-word ("...teams and agents sh",
// "...into a single system of") and those land verbatim on screen, where they read
// as a rendering bug rather than an edit. Only hard-cuts when a single word is
// itself longer than the budget.
const clip = (v, n) => {
  const t = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.55 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, "");
};

// A bullet/subtext line is WORTH rendering when it carries substance: a number,
// a currency/percent, or at least two real words. Kills "Yes.", "Wow" filler.
function meaty(line) {
  const t = clip(line, 200);
  if (!t) return false;
  if (/[0-9]/.test(t)) return true;
  return (t.match(/[A-Za-z]{2,}/g) || []).length >= 2;
}

// Sanitize ONE scene's enrichment against what the scene already has.
// Add-only: existing non-empty fields survive untouched.
function applyEnrichment(scene, raw, opts = {}) {
  if (!scene || !raw || typeof raw !== "object") return 0;
  let added = 0;
  // THE MODE'S LINE BUDGET. A faster film has shorter frames, and this director's
  // whole job is ADDING copy to them — so it is the one agent that most needs to
  // know the pace. `maxBullets` is the mode's per-scene line allowance minus the
  // headline that is always there; at relaxed/normal that is 3, exactly the cap
  // this used before pacing existed, so the default is untouched.
  const maxBullets = Math.max(1, Number(opts.maxBullets) || 3);
  // THE WIDTHS ARE THE SCENE'S, NOT THIS FILE'S.
  //
  // The four literals below (90 / 58 / 24 / 18) were fixed regardless of how long
  // the frame is up, so this director wrote a 58-character label onto a 2.3s
  // very-fast frame whose own readable ceiling is 17. The line was then re-clipped
  // by whichever composer drew it, at ITS width, mid-word — the "LangGraph
  // orchest" class of defect. pacing.visualCapacity() derives the real ceiling
  // from the scene's own clock; the literals stay as the fallback for a call with
  // no pace and no duration, which is exactly what they always were.
  const cap = opts.capacity || null;
  const wide = (role, dflt) => (cap && cap.roles && cap.roles[role]) || dflt;
  if (!clip(scene.subtext, 10) && meaty(raw.subtext)) {
    scene.subtext = clip(raw.subtext, wide("subtext", 90));
    added++;
  }
  const haveBullets = Array.isArray(scene.bullets) && scene.bullets.filter(Boolean).length > 0;
  if (!haveBullets && Array.isArray(raw.bullets)) {
    // 42 was tuned for single-line chip rows, which re-truncate to their own width
    // anyway (`fit(c, 24)`). The portrait support list WRAPS, so a longer line
    // survives intact instead of losing its verb — "One AI workspace where teams
    // and agents ship together" beat "...teams and".
    const bullets = raw.bullets.map((b) => clip(b, wide("bullet", 58))).filter(meaty).slice(0, maxBullets);
    if (bullets.length) { scene.bullets = bullets; added++; }
  }
  if (!clip(scene.emphasis, 1) && raw.emphasis) {
    const emph = clip(raw.emphasis, 24);
    // scene_kit highlights `emphasis` INSIDE the headline — a non-substring
    // emphasis renders nothing, so only accept a real (case-insensitive) match.
    const head = clip(scene.headline, 200).toLowerCase();
    if (emph && head.includes(emph.toLowerCase())) { scene.emphasis = emph; added++; }
  }
  if (!clip(scene.kicker, 1) && meaty(raw.kicker)) {
    scene.kicker = clip(raw.kicker, wide("kicker", 18));
    added++;
  }
  return added;
}

// ---- deterministic miner (fallback + belt-and-braces after the LLM) ----------
// Pull candidate lines from the script + brief, then fill still-empty slots in
// order. Numbers first (stats sell), then key messages, then leftover
// onScreenText lines that aren't already a headline.
function mineDeterministic(storyboard, script, brief, maxBullets = 3, paceCfg = null) {
  const scenes = (storyboard && storyboard.scenes) || [];
  const headlines = new Set(scenes.map((s) => clip(s.headline, 200).toLowerCase()).filter(Boolean));

  const pool = [];
  const seen = new Set();
  const push = (line) => {
    const t = clip(line, 90);
    const key = t.toLowerCase();
    if (!t || !meaty(t) || seen.has(key) || headlines.has(key)) return;
    seen.add(key);
    pool.push(t);
  };
  // Script's own on-screen lines, scene-aligned first so text lands where the
  // writer meant it (script scene i ↔ storyboard scene i when ids line up).
  const byScene = new Map();
  (script && script.scenes || []).forEach((sc) => {
    const lines = (sc.onScreenText || []).map((l) => clip(l, 90)).filter(meaty);
    if (lines.length) byScene.set(String(sc.id), lines);
  });
  (script && script.scenes || []).forEach((sc) => (sc.onScreenText || []).forEach(push));
  // MUST-INCLUDE FIRST. These are the facts the brief marked non-negotiable, and
  // they were missing from this pool entirely — so the one deterministic filler
  // in the pipeline was mining key messages and leftover display lines while up
  // to twelve verified facts sat unused in the same object.
  (brief && brief.mustIncludeFacts || []).forEach(push);
  (brief && brief.keyMessages || []).forEach(push);
  // Standalone stats anywhere in the brief text ("40+ templates", "$29/mo",
  // "10x faster", "99.9% uptime") become bullet fodder.
  const briefText = [brief?.improvedPrompt, brief?.goal, brief?.keyMessage].map((x) => String(x || "")).join(" ");
  for (const m of briefText.match(/(?:[$€₹]\s?\d[\d,.]*\s?\w{0,8}|\d[\d,.]*\s?(?:%|x|k|M|B)\+?(?:\s+\w+){0,3})/g) || []) push(m);

  let added = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    // 1) scene-aligned onScreenText → subtext + bullets for THAT scene
    const aligned = byScene.get(String(scene.id)) || [];
    const capacity = pacing.visualCapacity(paceCfg, Number(scene.duration) || (paceCfg && paceCfg.scene && paceCfg.scene.targetSec) || 3.5);
    added += applyEnrichment(scene, {
      subtext: aligned[0],
      bullets: aligned.slice(1, 1 + maxBullets),
    }, { maxBullets, capacity });
    // 2) global pool fills whatever is still empty.
    //
    // The hook and the CTA used to be excluded (`i > 0 && i < length - 1`), on
    // the reasoning that an opener and a closer are typographic statements. But
    // they are also the two frames a viewer is most likely to actually watch,
    // and at a fast pace they were the emptiest in the film — the opener carries
    // no kicker by default and the closer is usually a three-word imperative.
    // They get the same supply as everything else now; `applyEnrichment` is
    // add-only, so a scene that already reads as a deliberate statement is still
    // left exactly as its author wrote it.
    {
      const wantBullets = !(Array.isArray(scene.bullets) && scene.bullets.filter(Boolean).length);
      added += applyEnrichment(scene, {
        subtext: pool.shift(),
        bullets: wantBullets ? pool.splice(0, maxBullets) : [],
      }, { maxBullets, capacity });
    }
  }
  return added;
}

// ---- LLM pass ----------------------------------------------------------------
function buildUser({ brief, script, storyboard }) {
  const scenes = (storyboard.scenes || []).map((s, i) => ({
    id: s.id != null ? s.id : `s${i + 1}`,
    kind: s.kind,
    headline: clip(s.headline, 120),
    subtext: clip(s.subtext, 120) || undefined,
    bullets: (s.bullets || []).filter(Boolean).slice(0, 3),
    voiceover: clip(s.voiceover, 200) || undefined,
  }));
  return [
    `FILM: "${clip(storyboard.title || script?.title, 80)}" — ${storyboard.durationSec || "?"}s.`,
    "",
    "SOURCE COPY (mine THIS for important text — never invent facts):",
    JSON.stringify({
      subject: clip(brief?.subject, 120),
      improvedPrompt: clip(brief?.improvedPrompt, 700),
      keyMessages: (brief?.keyMessages || []).map((k) => clip(k, 120)).slice(0, 8),
      // THE FACTS THE BRIEF MARKED NON-NEGOTIABLE, and until this line they
      // reached nothing that writes on-screen copy: absent from this payload,
      // absent from graph.js storyboardPromptFromScript, absent from the
      // deterministic miner below. Up to twelve verified facts collected at
      // ingest, never once offered to the frame.
      mustIncludeFacts: (brief?.mustIncludeFacts || []).map((f) => clip(f, 160)).slice(0, 12),
      goal: clip(brief?.goal, 200),
      audience: clip(brief?.audience, 160),
      scriptOnScreenText: (script?.scenes || []).map((s) => ({ id: s.id, lines: (s.onScreenText || []).slice(0, 4) })),
    }),
    "",
    "CURRENT STORYBOARD SCENES (fill ONLY the missing text slots):",
    JSON.stringify(scenes),
    "",
    `Return JSON: {"scenes":{"<sceneId>":{"subtext":"...","bullets":["...","...","..."],"emphasis":"<one word FROM that scene's headline>","kicker":"..."}}}. Only include scenes you are adding text to, only slots that are currently empty. Short, punchy, factual — numbers and concrete feature names beat adjectives. JSON only.`,
  ].join("\n");
}

async function enrichWithLlm({ brief, script, storyboard, tracker, signal, maxBullets = 3, paceCfg = null }) {
  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: SYSTEM,
    user: buildUser({ brief, script, storyboard }),
    jsonMode: true,
    stage: "text_director",
    model: tdr().model,
    temperature: 0.3,
    signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "text_director", costUsd: costUsd });
  const raw = extractFirstJsonObject(text);
  const perScene = raw && raw.scenes && typeof raw.scenes === "object" ? raw.scenes : {};
  let added = 0;
  const scenes = storyboard.scenes || [];
  scenes.forEach((scene, i) => {
    const key = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const enrichment = perScene[key] || perScene[`s${i + 1}`] || null;
    if (enrichment) {
      added += applyEnrichment(scene, enrichment, {
        maxBullets, capacity: pacing.visualCapacity(paceCfg, Number(scene.duration) || (paceCfg && paceCfg.scene && paceCfg.scene.targetSec) || 3.5),
      });
    }
  });
  return added;
}

// ---------------------------------------------------------------- main
// Mutates storyboard scenes in place (add-only) and returns
// { storyboard, report } — report is persisted for the theater UI.
async function directText({ jobId, brief, script, storyboard, tracker, signal, pacing: pacingCfg }) {
  const sb = storyboard;
  // The mode's per-scene line allowance, minus the headline every scene carries.
  // Falls back to the storyboard's own attached config, then to 3 — the cap this
  // director used before pacing existed, which relaxed and normal both still
  // resolve to, so the default film is unchanged.
  const paceCfg = pacingCfg || (storyboard && storyboard.paceConfig) || null;
  // The label row's own budget. `bulletsPerScene` is the pacing engine's second
  // density axis and it RISES with pace (3/3/3/4); the old expression here was
  // `maxOnScreenLines - 1`, a number that FELL with it (3/3/2/2) because that
  // one field was serving both the narration directive and this director. A
  // config without the new axis still falls back to the pre-pacing cap of 3, so
  // an older storyboard.paceConfig behaves exactly as it did.
  const T = (paceCfg && paceCfg.text) || null;
  const maxBullets = Math.max(1, Number(T && T.bulletsPerScene) || Math.max(1, (T && T.maxOnScreenLines ? T.maxOnScreenLines : 4) - 1));
  if (!sb || !Array.isArray(sb.scenes) || !sb.scenes.length) {
    return { storyboard: sb, report: null };
  }

  let llmAdded = 0, minedAdded = 0, source = "deterministic";
  if (tdr().enabled) {
    try {
      llmAdded = await enrichWithLlm({ brief, script, storyboard: sb, tracker, signal, maxBullets, paceCfg });
      source = "llm";
    } catch (e) {
      console.warn(`[text_director] LLM failed (${String((e && e.message) || e).slice(0, 140)}) — deterministic mining only`);
    }
  }
  // Always run the miner after (or instead of) the LLM: it only touches slots
  // that are STILL empty, so it composes cleanly with the model's additions.
  try { minedAdded = mineDeterministic(sb, script, brief, maxBullets, paceCfg); } catch { /* fail-open */ }

  const withSub = sb.scenes.filter((s) => clip(s.subtext, 1)).length;
  const withBul = sb.scenes.filter((s) => Array.isArray(s.bullets) && s.bullets.filter(Boolean).length).length;
  const report = {
    source,
    added: llmAdded + minedAdded,
    llmAdded,
    minedAdded,
    scenesWithSubtext: withSub,
    scenesWithBullets: withBul,
    sceneCount: sb.scenes.length,
  };
  console.log(`[text_director] job ${jobId || "?"}: +${report.added} text slot(s) (${llmAdded} llm, ${minedAdded} mined) — ${withSub}/${sb.scenes.length} scenes have subtext, ${withBul} have bullets`);
  if (jobId) { try { db.setTextReview(jobId, report); } catch { /* best effort */ } }
  return { storyboard: sb, report };
}

module.exports = { directText };
