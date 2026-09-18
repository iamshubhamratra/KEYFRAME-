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
const db = require("../models/job");
const openrouter = require("./openrouter");
const pacing = require("./pacing");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_text_director.md"),
  "utf8"
);

function tdr() {
  return config.textDirector || { enabled: true, model: "google/gemini-3.1-flash-lite" };
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

// A script metric ({value:"6 hours", label:"saved every month"}) into the
// {v,suf,l} shape statsFor/template_engine already render. The renderers COUNT
// the figure up, so a value with no number in it is not a stat and is dropped
// rather than printed as a zero — "$29/mo" -> 29 "$/mo" would be worse than
// showing nothing. The unit travels in `suf` so the label stays a label.
function parseMetric(m, P) {
  if (!m || typeof m !== "object") return null;
  const value = clip(m.value, 16);
  const label = clip(m.label, P.visual.labelMaxChars);
  if (!value || !label) return null;
  const num = /(-?\d[\d,]*\.?\d*)/.exec(value);
  if (!num) return null;
  const v = Number(String(num[1]).replace(/,/g, ""));
  if (!isFinite(v)) return null;
  // Whatever follows the number is the unit ("%", "x", "K", "hours"); a long
  // word belongs in the label, not stamped onto the figure.
  const suf = clip(value.slice(num.index + num[1].length), 4);
  return { v, suf, l: label };
}

// Sanitize ONE scene's enrichment against what the scene already has.
// Add-only: existing non-empty fields survive untouched.
function applyEnrichment(scene, raw, pacingIn) {
  if (!scene || !raw || typeof raw !== "object") return 0;
  const P = pacing.resolve(pacingIn);
  let added = 0;
  if (!clip(scene.subtext, 10) && meaty(raw.subtext)) {
    scene.subtext = clip(raw.subtext, P.subtextChars);
    added++;
  }
  const haveBullets = Array.isArray(scene.bullets) && scene.bullets.filter(Boolean).length > 0;
  if (!haveBullets && Array.isArray(raw.bullets)) {
    // 42 was tuned for single-line chip rows, which re-truncate to their own width
    // anyway (`fit(c, 24)`). The portrait support list WRAPS, so a longer line
    // survives intact instead of losing its verb — "One AI workspace where teams
    // and agents ship together" beat "...teams and".
    //
    // PACE NOW MOVES THESE TWO NUMBERS IN OPPOSITE DIRECTIONS. It used to drop
    // the COUNT as pace rose, on the reasoning that losing the third pill was
    // cheaper than truncating the lines that remain. Both of those shrink the
    // frame, and a Very Fast scene — which already speaks half as many words —
    // ended up with two short pills and nothing else. So the trade is now
    // explicit: each line gets SHORTER (visual.lineMaxChars, so it can be read
    // in a shorter scene) and the film gets MORE of them (P.bulletsMax rises
    // with the narration deficit). Same reading time per line, more of the
    // message on screen. Both are the previous literals at Normal.
    const bullets = raw.bullets.map((b) => clip(b, P.visual.lineMaxChars)).filter(meaty).slice(0, P.bulletsMax);
    if (bullets.length) { scene.bullets = bullets; added++; }
  }
  // METRICS — a figure the frame lands on its own. `stats` is the slot every
  // renderer already reads ({v,suf,l}); the script writes {value,label}, so the
  // value string is split into its number and unit here. Add-only like the rest.
  const haveStats = Array.isArray(scene.stats) && scene.stats.length > 0;
  if (!haveStats && Array.isArray(raw.metrics) && raw.metrics.length) {
    const stats = [];
    for (const m of raw.metrics) {
      const parsed = parseMetric(m, P);
      if (parsed) stats.push(parsed);
      if (stats.length >= P.visual.metrics) break;
    }
    if (stats.length) { scene.stats = stats; added++; }
  }
  if (!clip(scene.emphasis, 1) && raw.emphasis) {
    const emph = clip(raw.emphasis, 24);
    // scene_kit highlights `emphasis` INSIDE the headline — a non-substring
    // emphasis renders nothing, so only accept a real (case-insensitive) match.
    const head = clip(scene.headline, 200).toLowerCase();
    if (emph && head.includes(emph.toLowerCase())) { scene.emphasis = emph; added++; }
  }
  if (!clip(scene.kicker, 1) && meaty(raw.kicker)) {
    scene.kicker = clip(raw.kicker, 18);
    added++;
  }
  return added;
}

// ---- deterministic miner (fallback + belt-and-braces after the LLM) ----------
// Pull candidate lines from the script + brief, then fill still-empty slots in
// order. Numbers first (stats sell), then key messages, then leftover
// onScreenText lines that aren't already a headline.
function mineDeterministic(storyboard, script, brief, pacingIn) {
  const P = pacing.resolve(pacingIn);
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
  //
  // `keyPoints` OUTRANK `onScreenText` as bullet material and are kept in their
  // own lane. They are the fields the writer filled specifically for the frame —
  // the supporting facts the voiceover had no room for — whereas onScreenText[0]
  // is the scene's headline beat and usually belongs in the subtext slot, not
  // the pill row. Before the visual channel existed both had to come out of the
  // same array, which is why a fast film's pills were whatever was left after
  // the headline took the first line.
  const byScene = new Map();
  const pointsByScene = new Map();
  const metricsByScene = new Map();
  (script && script.scenes || []).forEach((sc) => {
    const lines = (sc.onScreenText || []).map((l) => clip(l, 90)).filter(meaty);
    if (lines.length) byScene.set(String(sc.id), lines);
    const pts = (sc.keyPoints || []).map((l) => clip(l, 90)).filter(meaty);
    if (pts.length) pointsByScene.set(String(sc.id), pts);
    const mets = (sc.metrics || []).filter((m) => m && m.value != null && m.label != null);
    if (mets.length) metricsByScene.set(String(sc.id), mets);
  });
  (script && script.scenes || []).forEach((sc) => (sc.onScreenText || []).forEach(push));
  // …and keyPoints also join the GLOBAL pool, after the scene-aligned pass has
  // taken its own. A scene the writer left thin can then borrow a point from a
  // scene that had more than it could show, which is what stops one dense frame
  // sitting next to a bare one.
  (script && script.scenes || []).forEach((sc) => (sc.keyPoints || []).forEach(push));
  (brief && brief.keyMessages || []).forEach(push);
  // Standalone stats anywhere in the brief text ("40+ templates", "$29/mo",
  // "10x faster", "99.9% uptime") become bullet fodder.
  const briefText = [brief?.improvedPrompt, brief?.goal, brief?.keyMessage].map((x) => String(x || "")).join(" ");
  for (const m of briefText.match(/(?:[$€₹]\s?\d[\d,.]*\s?\w{0,8}|\d[\d,.]*\s?(?:%|x|k|M|B)\+?(?:\s+\w+){0,3})/g) || []) push(m);

  let added = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    // 1) the writer's own visual channel for THAT scene: the headline beat
    //    becomes the support line, the keyPoints become the pill row, and the
    //    metrics become the stat. Where a scene has no keyPoints (a legacy
    //    script, or a model that ignored the field) the bullets fall back to the
    //    remaining onScreenText lines, which is exactly the previous behaviour.
    const aligned = byScene.get(String(scene.id)) || [];
    const points = pointsByScene.get(String(scene.id)) || [];
    added += applyEnrichment(scene, {
      subtext: aligned[0],
      bullets: (points.length ? points : aligned.slice(1)).slice(0, P.bulletsMax),
      metrics: metricsByScene.get(String(scene.id)) || [],
    }, P);
    // 2) global pool fills whatever is still empty on content scenes
    if (i > 0 && i < scenes.length - 1) {
      const wantBullets = !(Array.isArray(scene.bullets) && scene.bullets.filter(Boolean).length);
      // Take only as many as this pace will keep — lines spliced out of the pool
      // and then sliced off are lines a later scene never gets to use.
      added += applyEnrichment(scene, {
        subtext: pool.shift(),
        bullets: wantBullets ? pool.splice(0, P.bulletsMax) : [],
      }, P);
    }
  }
  return added;
}

// ---- LLM pass ----------------------------------------------------------------
function buildUser({ brief, script, storyboard, pacing: pacingIn }) {
  const P = pacing.resolve(pacingIn);
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
      goal: clip(brief?.goal, 200),
      audience: clip(brief?.audience, 160),
      scriptOnScreenText: (script?.scenes || []).map((s) => ({ id: s.id, lines: (s.onScreenText || []).slice(0, 6) })),
      scriptKeyPoints: (script?.scenes || []).map((s) => ({ id: s.id, points: (s.keyPoints || []).slice(0, 5) })).filter((s) => s.points.length),
      scriptMetrics: (script?.scenes || []).map((s) => ({ id: s.id, metrics: (s.metrics || []).slice(0, 3) })).filter((s) => s.metrics.length),
    }),
    "",
    "CURRENT STORYBOARD SCENES (fill ONLY the missing text slots):",
    JSON.stringify(scenes),
    "",
    // THE DENSITY BUDGET, STATED. Without it the model returns the three bullets
    // its examples show, whatever the pace — and a Very Fast film, whose voice
    // carries half a Normal film's words, would keep getting a Normal film's
    // frame. The counts come from the same profile the deterministic miner uses,
    // so the two passes cannot disagree about how full a scene should be.
    `DENSITY — ${P.label} pace. This film speaks ${P.wordsPerSec} words/sec, so the FRAME carries ${P.visual.gain > 1 ? `${P.visual.gain}x more of the message than a Normal film` : "its usual share of the message"}.`,
    `- Up to ${P.bulletsMax} bullets per scene, each ≤ ${P.visual.lineMaxChars} characters. Short parallel fragments, no trailing period.`,
    `- Prefer MORE, SHORTER bullets over fewer long ones: they arrive in sequence on screen, so a short line is read while a long one is skipped.`,
    "- Bullets are the facts the voiceover did NOT say. Never restate the scene's own voiceover line.",
    "",
    `Return JSON: {"scenes":{"<sceneId>":{"subtext":"...","bullets":["...","..."],"emphasis":"<one word FROM that scene's headline>","kicker":"...","metrics":[{"value":"6 hours","label":"saved every month"}]}}}. Only include scenes you are adding text to, only slots that are currently empty. Short, punchy, factual — numbers and concrete feature names beat adjectives. Facts only from the source copy above; never invent a figure. JSON only.`,
  ].join("\n");
}

async function enrichWithLlm({ brief, script, storyboard, tracker, signal, pacing: pacingIn }) {
  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: SYSTEM,
    user: buildUser({ brief, script, storyboard, pacing: pacingIn }),
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
    if (enrichment) added += applyEnrichment(scene, enrichment, pacingIn);
  });
  return added;
}

// ---------------------------------------------------------------- main
// Mutates storyboard scenes in place (add-only) and returns
// { storyboard, report } — report is persisted for the theater UI.
async function directText({ jobId, brief, script, storyboard, tracker, signal, pacing: pacingIn }) {
  const sb = storyboard;
  if (!sb || !Array.isArray(sb.scenes) || !sb.scenes.length) {
    return { storyboard: sb, report: null };
  }

  // Resolved once and passed down: a caller that predates pace (or a legacy job
  // row) lands on the frozen `normal` profile, which is today's 3 bullets / 90
  // chars exactly.
  const P = pacing.resolve(pacingIn);
  let llmAdded = 0, minedAdded = 0, source = "deterministic";
  if (tdr().enabled) {
    try {
      llmAdded = await enrichWithLlm({ brief, script, storyboard: sb, tracker, signal, pacing: P });
      source = "llm";
    } catch (e) {
      console.warn(`[text_director] LLM failed (${String((e && e.message) || e).slice(0, 140)}) — deterministic mining only`);
    }
  }
  // Always run the miner after (or instead of) the LLM: it only touches slots
  // that are STILL empty, so it composes cleanly with the model's additions.
  try { minedAdded = mineDeterministic(sb, script, brief, P); } catch { /* fail-open */ }

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
