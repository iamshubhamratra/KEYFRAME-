// SCREENSHOT QA AGENT — the last gate between a website capture and the screen.
//
// Runs AFTER all owner imagery is collected (ingest landing shots, the Screenshot
// Director's topic captures, the site's own images, blog images) and BEFORE the
// creative director / composition ever sees them. All of it is "trusted owner
// content" so it skips the stock relevance gate — which meant a capture that came
// back as a 404, a Cloudflare bot-wall, a cookie-consent modal or a blank
// half-render went straight into the film as a full-screen hero shot. This agent
// looks at every one and DROPS the broken ones.
//
// It is also the ONLY per-scene "does this picture match what this scene SAYS"
// test in the pipeline (matchesScene / bestSceneId below), which is why it must
// see every owner class rather than just the landing captures — see
// OWNER_SHOT_SOURCES.
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
      // Independent per-file decodes — see the note in creative_director.reviewChunk.
      thumbs.push(...await Promise.all(chunk.map((s) => thumbBase64(s.absPath, false).catch(() => null))));
      const usable = thumbs.map((b, i) => ({ b, i })).filter((x) => x.b);
      if (!usable.length) continue;

      const content = [{
        type: "text",
        text:
          `${scenesLine}These ${usable.length} owner image(s) — website captures and the site's / post's own images — were collected for a short promo film about: "${subject || "a product"}". ` +
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

// EVERY owner/trusted image class, not just the landing captures. All four are
// pinned to a scene in pure ARRIVAL ORDER by whoever produced them, and all four
// skip the stock relevance gate because they are "owner content" — so this gate is
// the ONLY place anything asks "does this picture match the line this scene
// speaks?". Restricting it to source==="website" left three classes unchecked:
//   "topic-screenshot" — the Screenshot Director's topic captures, which ship
//                        `visionOk: true` (pre-approved for prominent slots) from
//                        topic_shots.js and were never looked at again. On
//                        /api/generate (pipeline.js) the gate is handed NOTHING
//                        BUT topic captures, so it inspected zero assets there.
//   "website-image"    — the site's own downloaded images (hero art, decorative
//                        gradients) pinned to showcase scenes in arrival order.
//   "blog"             — images lifted from the source post, pinned the same way.
const OWNER_SHOT_SOURCES = new Set(["website", "topic-screenshot", "website-image", "blog"]);

// A real CAPTURE can come back broken (404, consent modal, bot-wall) and is cheap
// to re-take, so a failed one is deleted from disk. A downloaded owner IMAGE is
// not a capture and cannot be re-shot — drop it from the pool on a failure, but
// never unlink it, so a false positive costs a slot rather than the file.
const isCapture = (a) => {
  const s = String((a && a.source) || "");
  return s === "website" || s === "topic-screenshot";
};

// Convenience wrapper used by the pipelines: takes the pinned owner-content asset
// objects (path relative to jobDir, source in OWNER_SHOT_SOURCES), inspects each
// for BOTH capture quality AND scene-match, then FIXES problems:
//   • broken/error/blank capture  -> DROP (and delete from disk, if a capture),
//   • good image on the WRONG scene -> RE-PIN to the scene it actually fits
//     (if that scene is free), else UNPIN into the free pool,
//   • good image on the right scene -> keep.
// `script` supplies the scenes (topics + timing) used for matching + re-pinning.
// Stock and every other non-owner asset passes through untouched. Fail-open throughout.
async function qaGateScreenshots({ assets, jobDir, subject, script, tracker, log = console, onDrop, _inspect = inspectScreenshots } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const shotIdx = [];
  list.forEach((a, i) => { if (a && OWNER_SHOT_SOURCES.has(String(a.source || "")) && a.type === "image") shotIdx.push(i); });
  if (!shotIdx.length) return list;

  const allScenes = (script && Array.isArray(script.scenes)) ? script.scenes : [];
  const sceneById = new Map(allScenes.map((s) => [String(s.id), s]));
  const sceneDigest = allScenes.map((s) => ({ id: s.id, topic: sceneTopic(s) }));

  const verdicts = await _inspect({
    shots: shotIdx.map((i) => {
      const a = list[i];
      const sc = sceneById.get(String(a.sceneId));
      // Tell the model WHAT it is looking at. The quality half of its verdict is
      // written for page captures ("blank", "consent-overlay"); a photo lifted off
      // a blog post is not a failed capture and must not be failed as one.
      const cls = a.source === "blog" ? "image from the source blog post"
        : a.source === "website-image" ? "image downloaded from the site itself"
        : a.source === "topic-screenshot" ? "capture of a third-party site, shown as an industry example"
        : null;
      return {
        absPath: path.isAbsolute(a.path) ? a.path : path.join(jobDir, a.path),
        label: [cls, a.alt ? String(a.alt).slice(0, 70) : ""].filter(Boolean).join(" — ") || undefined,
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
      // Report it: this page is unusable, but ANOTHER page may still serve the
      // scene, and only the caller knows how to go and get one.
      try { onDrop?.({ sceneId: String(a.sceneId), reason: String(v.problem || "rejected"), recoverable: isCapture(a), path: a.path }); } catch { /* noop */ }
      if (isCapture(a)) del(a.path);
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
      // Only a real capture gets the browser-frame instruction — wrapping a blog
      // photo in browser chrome tells the viewer it is a page, which it is not.
      a.alt = isCapture(a)
        ? "REAL website screenshot — matches this scene's topic — present in a styled browser frame with hero treatment"
        : `${String(a.alt || "owner image").slice(0, 90)} — matches this scene's topic`;
      repinned++;
      log.log?.(`[screenshot-qa] shot RE-PINNED scene ${cur} → ${bestId} (${v.sees || "better match"}) — ${base}`);
    } else {
      // A CLEAN SCREENSHOT WITH NOWHERE TO SIT IS STILL A REAL SCREENSHOT.
      // This branch used to DELETE it — measured on a finished film, two good
      // Trello captures were destroyed purely because every scene already held
      // one, and generic stock then filled the montage slots. Unpin it instead:
      // with no sceneId it joins the composer's free pool, where walls, montages
      // and B-roll slots can use it. Only a capture that is genuinely BROKEN
      // (the branch above) is worth deleting.
      claimed.delete(cur);
      a.sceneId = null; a.startSec = undefined; a.durationSec = undefined;
      a.style = "background";
      a.alt = isCapture(a)
        ? "REAL website screenshot — product UI, unpinned (no scene of its own)"
        : `${String(a.alt || "owner image").slice(0, 90)} — unpinned (no scene of its own)`;
      problems.push("scene-mismatch-unpinned");
      log.log?.(`[screenshot-qa] shot UNPINNED (clean, but no free matching scene) — ${base}`);
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
