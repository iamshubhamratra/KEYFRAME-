// SCREENSHOT QA AGENT — the last gate between a website capture and the screen.
//
// Runs AFTER all screenshots are collected (ingest landing shots + the
// Screenshot Director's topic captures) and BEFORE the creative director /
// composition ever sees them. Screenshots are "trusted owner content" so they
// skip the stock relevance gate — which meant a capture that came back as a
// 404, a Cloudflare bot-wall, a cookie-consent modal or a blank half-render
// went straight into the film as a full-screen hero shot. This agent looks at
// every capture and DROPS the broken ones.
//
// One batched vision pass (chunks of 6), same cheap flash model as the other
// directors. FAIL-OPEN by design: any error (dead budget, un-thumbnailable
// file, bad JSON, missing verdict) keeps that screenshot, so QA can only ever
// remove provably-bad captures — never block a job or strip a film of every
// product shot by accident.

const fs = require("node:fs");
const path = require("node:path");
const { thumbBase64 } = require("./asset_vision");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_screenshot_qa.md"),
  "utf8",
);

const PROBLEMS = new Set([
  "error-page", "blocked", "consent-overlay", "login-wall",
  "blank", "loading", "broken-layout", "wrong-content",
]);

// -> array aligned 1:1 with `shots`, each {pass:boolean, problem?, sees?}.
//    Fail-open: {pass:true} wherever the model was silent or errored.
// `shots`: [{ absPath, label? }]
// `shots`: [{ absPath, label?, sceneText? }] — sceneText is the topic of the scene
// this shot is pinned to. `scenes`: [{ id, topic }] — all film scenes, so the model
// can name a better-fitting scene for a mismatched shot.
// -> array aligned 1:1 with `shots`, each { pass, problem?, sees?, matchesScene, bestSceneId }.
async function inspectScreenshots({ shots, subject, scenes, tracker, signal } = {}) {
  const out = (shots || []).map(() => ({ pass: true, matchesScene: true, bestSceneId: null }));
  if (!Array.isArray(shots) || !shots.length) return out;

  const scenesLine = (Array.isArray(scenes) && scenes.length)
    ? `SCENES in this film (id — what it is about):\n${scenes.map((s) => `- id=${JSON.stringify(s.id)}: ${String(s.topic || "").slice(0, 140)}`).join("\n")}\n\n`
    : "";

  const CHUNK = 6;
  for (let start = 0; start < shots.length; start += CHUNK) {
    const chunk = shots.slice(start, start + CHUNK);
    try {
      const thumbs = [];
      for (const s of chunk) thumbs.push(await thumbBase64(s.absPath, false));
      const usable = thumbs.map((b, i) => ({ b, i })).filter((x) => x.b);
      if (!usable.length) continue;

      const content = [{
        type: "text",
        text:
          `${scenesLine}These ${usable.length} website screenshot(s) were captured for a short promo film about: "${subject || "a product"}". ` +
          `For EACH, judge BOTH the capture quality AND whether it matches the scene it is pinned to (per the schema). ` +
          `Each screenshot is preceded by its number and the topic of the scene it is pinned to.`,
      }];
      usable.forEach((x, n) => {
        const s = chunk[x.i] || {};
        content.push({ type: "text", text: `Screenshot ${n + 1}${s.label ? ` (${s.label})` : ""} — pinned to a scene about: ${s.sceneText || "(unknown)"}:` });
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b}` } });
      });

      const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
        system: SYSTEM,
        user: content,
        jsonMode: true,
        stage: "screenshotQa",
        temperature: 0,
        signal,
      });
      if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "screenshotQa", costUsd: costUsd });

      const parsed = extractFirstJsonObject(text);
      const arr = Array.isArray(parsed && parsed.shots) ? parsed.shots : [];
      const byN = new Map();
      for (const v of arr) { const n = Number(v && v.n); if (Number.isFinite(n)) byN.set(n, v); }
      usable.forEach((x, n) => {
        const v = byN.get(n + 1);
        if (!v) return;
        const fail = String(v.verdict || "").toLowerCase() === "fail";
        out[start + x.i] = {
          pass: !fail,
          problem: fail && PROBLEMS.has(v.problem) ? v.problem : (fail ? "broken-layout" : undefined),
          sees: typeof v.sees === "string" ? v.sees.slice(0, 80) : undefined,
          // fail-open on scene-match: only act when the model EXPLICITLY says false.
          matchesScene: v.matchesScene !== false,
          bestSceneId: (v.matchesScene === false && v.bestSceneId != null) ? v.bestSceneId : null,
        };
      });
    } catch {
      // fail-open: keep every screenshot in this chunk
    }
  }
  return out;
}

// A scene's topic string for the vision model to match a screenshot against.
function sceneTopic(sc) {
  return [
    sc.purpose ? `(${sc.purpose})` : "",
    Array.isArray(sc.onScreenText) ? sc.onScreenText.join(" ") : "",
    sc.voiceover, sc.visualDirection,
  ].map((x) => String(x || "").trim()).filter(Boolean).join(" · ").slice(0, 160);
}

// Convenience wrapper used by the pipelines: takes the pinned screenshot asset
// objects (path relative to jobDir, source:"website"), inspects each for BOTH
// capture quality AND scene-match, then FIXES problems:
//   • broken/error/blank capture  -> DROP (delete from disk),
//   • good page on the WRONG scene -> RE-PIN to the scene it actually fits
//     (if that scene is free), else DROP (a wrong-scene shot is worse than a vector),
//   • good page on the right scene -> keep.
// `script` supplies the scenes (topics + timing) used for matching + re-pinning.
// Non-screenshot assets pass through untouched. Fail-open throughout.
async function qaGateScreenshots({ assets, jobDir, subject, script, tracker, log = console, _inspect = inspectScreenshots } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const shotIdx = [];
  list.forEach((a, i) => { if (a && a.source === "website" && a.type === "image") shotIdx.push(i); });
  if (!shotIdx.length) return list;

  const allScenes = (script && Array.isArray(script.scenes)) ? script.scenes : [];
  const sceneById = new Map(allScenes.map((s) => [String(s.id), s]));
  const sceneDigest = allScenes.map((s) => ({ id: s.id, topic: sceneTopic(s) }));

  const verdicts = await _inspect({
    shots: shotIdx.map((i) => {
      const a = list[i];
      const sc = sceneById.get(String(a.sceneId));
      return {
        absPath: path.isAbsolute(a.path) ? a.path : path.join(jobDir, a.path),
        label: a.alt ? String(a.alt).slice(0, 70) : undefined,
        sceneText: sc ? sceneTopic(sc) : undefined,
      };
    }),
    subject, scenes: sceneDigest, tracker,
  });

  const dropZ = new Set();
  const problems = [];
  let repinned = 0;
  // Scenes currently showing a KEPT screenshot — enforce one screenshot per scene
  // as re-pins move shots around.
  const claimed = new Set(shotIdx.map((i) => String(list[i].sceneId)));
  const del = (relOrAbs) => { try { fs.unlinkSync(path.isAbsolute(relOrAbs) ? relOrAbs : path.join(jobDir, relOrAbs)); } catch { /* noop */ } };

  verdicts.forEach((v, k) => {
    const i = shotIdx[k];
    const a = list[i];
    const base = path.basename(a.path);

    if (!v.pass) { // capture-quality failure → drop
      dropZ.add(i); problems.push(v.problem || "rejected"); claimed.delete(String(a.sceneId));
      log.warn?.(`[screenshot-qa] shot REJECTED (${v.problem}${v.sees ? `: ${v.sees}` : ""}) — ${base}`);
      del(a.path);
      return;
    }
    if (v.matchesScene) { // clean + on-topic → keep
      if (v.sees) log.log?.(`[screenshot-qa] shot ok (${v.sees}) — ${base}`);
      return;
    }
    // Clean capture, WRONG scene → re-pin to the scene it actually fits, else drop.
    const bestId = v.bestSceneId != null ? String(v.bestSceneId) : null;
    const target = bestId ? sceneById.get(bestId) : null;
    const cur = String(a.sceneId);
    if (target && bestId !== cur && !claimed.has(bestId)) {
      claimed.delete(cur); claimed.add(bestId);
      a.sceneId = target.id; a.startSec = target.start; a.durationSec = target.duration;
      a.alt = "REAL website screenshot — matches this scene's topic — present in a styled browser frame with hero treatment";
      repinned++;
      log.log?.(`[screenshot-qa] shot RE-PINNED scene ${cur} → ${bestId} (${v.sees || "better match"}) — ${base}`);
    } else {
      dropZ.add(i); problems.push("scene-mismatch"); claimed.delete(cur);
      log.warn?.(`[screenshot-qa] shot DROPPED (scene mismatch, no free matching scene) — ${base}`);
      del(a.path);
    }
  });

  // Persist the verdict counts so the Quality Director can surface kept/dropped/re-pinned.
  try {
    fs.writeFileSync(
      path.join(jobDir, "screenshot-qa.json"),
      JSON.stringify({ kept: shotIdx.length - dropZ.size, dropped: dropZ.size, repinned, problems }, null, 2),
    );
  } catch { /* best-effort */ }

  if (repinned) log.log?.(`[screenshot-qa] re-pinned ${repinned} mismatched screenshot(s) to the scene they fit`);
  if (!dropZ.size) return list;
  if (dropZ.size === shotIdx.length) {
    log.warn?.(`[screenshot-qa] all ${shotIdx.length} screenshots failed QA — composition falls back to stock/vector art`);
  }
  return list.filter((_, i) => !dropZ.has(i));
}

module.exports = { inspectScreenshots, qaGateScreenshots };
