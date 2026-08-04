// The KEYFRAME agent graph — LangGraph orchestration of the 12 agents.
//
//   INTAKE GRAPH      brief → script  (pauses at script_review via the API)
//
//   PRODUCTION GRAPH                  ┌─ storyboard ── scene_planner ─┐
//     frame_selector ── fan-out ──────┼─ asset_planner ─ asset_search ┼── composition ── animation ─┐
//                                     └─ voice ───────────────────────┘                             │
//                                                  ┌──────────────────────────────────── timeline ──┘
//                                                  └→ qa ──(blockers & repairs left)→ composition (one repair lap)
//                                                       └──(pass / out of repairs)──→ END
//
// Every node is a thin agent wrapping the battle-tested service functions —
// the graph owns ordering, joins, and the QA repair loop; the services own
// the work. JSON state flows between nodes; HyperFrames renders the MP4.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const { UsageTracker } = require("../services/usage");
const { generateBrief } = require("../services/brief");
const { generateScript, normalizeScript } = require("../services/script");
const { generateStoryboard } = require("../services/storyboard");
const frameRegistry = require("../services/frame_registry");
const { withBudget, attemptLlmComposition, composeWithThree, isAssetRich, mixAudioIntoVideo, fallbackQueriesFor, composerStringsFor } = require("../services/pipeline");
const { acquire, hasProviderFor, makeImageDeduper, ffprobeImage } = require("../services/asset_sources");
const { styleFor, iconColorFor } = require("../services/pack_style");
const { synthesizeFitted } = require("../services/vo_fit");
const { buildCues, writeSrt, writeVtt } = require("../services/captions");
const { resolveCaptionPlan, finalizeQuality } = require("../services/caption_director");
const captionDirector = require("../services/caption_director");
const languageDirector = require("../services/language_director");
const captionLang = require("../services/caption_lang");
const { injectCaptionStyle } = require("../services/caption_render");
const { fetchMusic } = require("../services/audio_sources");
const { getSfx } = require("../services/sfx_library");
const { planSfx } = require("../services/sfx_plan");
const audioProfileSvc = require("../services/audio_profile");
const { VALID_VOICES } = require("../services/audio_planner");
const { buildFallback } = require("../services/fallback");
const { normalizeComposition } = require("../services/normalize");
const { render } = require("../services/renderer");
const { reviewRender } = require("./qa_agent");
const { checkAssetsRelevance } = require("../services/asset_vision");
const { reviewAndCurate } = require("../services/creative_director");
const { directAudio } = require("../services/audio_director");
const { directBrand, defaultBrandSkin, persistBrandReview } = require("../services/art_director");
const { directLayout } = require("../services/visual_layout_director");
const { pinUserAssets } = require("../services/user_assets");
const { pinWebsiteAssets } = require("../services/website_assets");
const { coverageFromHtml } = require("../services/asset_coverage");
const { scoreBrandCoverage } = require("../services/brand_coverage");
const { computeAssetBudget } = require("../services/asset_budget");
const { preflight } = require("../services/preflight");
const { kindForPurpose } = require("../services/asset_taxonomy");
const { roleOf, showcaseTargets } = require("../services/scene_role");
const { reconcileStoryboard } = require("../services/continuity");
const { planMotion, verifyMotion } = require("../services/motion_planner");

function ms() { return Date.now(); }
function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }

// Packs whose on-screen text is NOT DOM-localizable: flagship/brightlife bake text into
// WebGL canvas textures (CSS/DOM can't reach it); terminal-departures runs text through
// an [A-Z0-9] split-flap filter that DELETES non-Latin characters. For a non-Latin
// video-text language, these produce broken/English output — the frame selector prefers
// a clean pack (or discloses when the user explicitly chose one).
const CANVAS_OR_CHARSET_RENDERERS = new Set(["three-flagship", "three-brightlife", "three", "terminal-departures"]);
function rendererOf(pack) {
  try { const m = require("../services/frame_manifest").getManifest(pack); return (m && m.renderer) || ""; }
  catch { return ""; }
}
function isCanvasOrCharsetPack(pack) { return CANVAS_OR_CHARSET_RENDERERS.has(rendererOf(pack)); }
// Prefer the brief's suggestion when it's clean, else the first clean pack in the
// registry, else the global default.
function pickCleanPack(prefer) {
  const p = frameRegistry.resolvePack(prefer);
  if (p && !isCanvasOrCharsetPack(p)) return p;
  for (const id of frameRegistry.listPacks()) {
    const rp = frameRegistry.resolvePack(id);
    if (rp && !isCanvasOrCharsetPack(rp)) return rp;
  }
  return frameRegistry.resolvePack("auto");
}

// The first installed pack authored for THIS job's aspect — preferring the brief's
// suggestion when it already fits. Returns null when no installed pack can serve the
// orientation, in which case the caller keeps its pick and discloses rather than
// swapping to something equally wrong.
function pickFittingPack(prefer, orientation) {
  const { packFitsOrientation } = require("../services/frame_manifest");
  const p = frameRegistry.resolvePack(prefer);
  if (p && packFitsOrientation(p, orientation)) return p;
  for (const id of frameRegistry.listPacks()) {
    const rp = frameRegistry.resolvePack(id);
    if (rp && packFitsOrientation(rp, orientation)) return rp;
  }
  return null;
}

// ---------------------------------------------------------------- helpers
function storyboardPromptFromScript(script, brief) {
  const lines = [
    `Produce this exact video: "${script.title}".`,
    brief ? `Context: ${brief.improvedPrompt}` : "",
    "",
    "Scene-by-scene plan (FOLLOW these timings and contents exactly — same number of scenes, same start/duration):",
  ];
  for (const s of script.scenes) {
    lines.push(
      `- Scene ${s.id} [${s.start}s + ${s.duration}s] (${s.purpose}): ${s.visualDirection} ` +
      (s.onScreenText.length ? `On-screen text: ${s.onScreenText.map((t) => `"${t}"`).join(", ")}. ` : "") +
      (s.voiceover ? `Narration meanwhile: "${s.voiceover}"` : "No narration.")
    );
  }
  return lines.join("\n");
}

// Deterministic storyboard built directly from the APPROVED script — the fail-open
// fallback for storyboardAgent. The script already carries validated scenes (ids,
// gapless timing, copy, purpose), so this preserves the user's approved structure
// exactly; scene_planner then fills in beats. Lets a flaky storyboard LLM response
// degrade gracefully instead of aborting the whole production graph.
function storyboardFromScript(script, job, brief) {
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const total = scenes.length;
  const kindFor = (purpose, i) => {
    const p = String(purpose || "").toLowerCase();
    if (i === 0 || /hook|title|intro|open/.test(p)) return "hook";
    if (i === total - 1 || /cta|call|close|outro|sign\s*up|subscribe/.test(p)) return "cta";
    if (/quote|testimonial|review/.test(p)) return "quote";
    if (/stat|number|metric|proof|result|chart|data/.test(p)) return "stat";
    return "bullet";
  };
  const animFor = (k) => k === "hook" ? "spring" : k === "cta" ? "char-pop" : k === "quote" ? "mask-reveal" : "drift";
  const hex = (c) => { const h = String(c || "").trim(); return /^#?[0-9a-fA-F]{6}$/.test(h) ? (h.startsWith("#") ? h : `#${h}`) : null; };
  // Only colours the analysed SITE actually showed. brief.brandColors is now filtered
  // to the extracted set at source (services/brief.js), but this fallback storyboard is
  // also built for prompt-only jobs where there is no site at all — and it used to take
  // whatever the brief offered, which is precisely the invented palette the Art Director
  // refuses. One agent's guard was another's blind spot; both now read the same rule.
  const brand = (Array.isArray(brief?.brandColors) ? brief.brandColors : []).map(hex).filter(Boolean);
  const words = (t) => String(t || "").trim().split(/\s+/).filter(Boolean);
  const sbScenes = scenes.map((sc, i) => {
    const kind = kindFor(sc.purpose, i);
    const ost = Array.isArray(sc.onScreenText) ? sc.onScreenText.slice(0, 4) : [];
    const headline = ost[0] || words(sc.voiceover).slice(0, 6).join(" ") || sc.purpose || "";
    return {
      id: sc.id != null ? sc.id : `s${i + 1}`,
      start: sc.start, duration: sc.duration,
      kind, animation: animFor(kind),
      headline: String(headline).slice(0, 80),
      subtext: ost[1] ? String(ost[1]).slice(0, 80) : "",
      onScreenText: ost,
      voiceover: typeof sc.voiceover === "string" ? sc.voiceover.trim().slice(0, 400) : "",
      purpose: sc.purpose || "",
      visualDirection: sc.visualDirection || "",
      emphasis: "",
      beats: [], // scene_planner derives these deterministically
    };
  });
  const durationSec = scenes.reduce((a, s) => Math.max(a, (s.start || 0) + (s.duration || 0)), 0) || job?.duration || 12;
  return {
    title: String(script?.title || job?.prompt || "KEYFRAME").slice(0, 120),
    durationSec: Math.round(durationSec * 100) / 100,
    orientation: job?.orientation || "horizontal",
    palette: { background: "#0B0B12", text: "#FFFFFF", primary: brand[0] || "#6366F1", accent: brand[1] || brand[0] || "#8B5CF6" },
    scenes: sbScenes,
    source: "script-fallback",
  };
}

// The voices the gpt-audio TTS family actually renders (tts.js AUDIO_VOICES).
// pickVoice MUST resolve to one of these — emitting a tts-1-era voice
// (fable/nova/onyx) would be silently downgraded to marin by tts.mapVoice().
const AUDIO_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]);

function pickVoice(job, script) {
  // 1) An explicit, exact voice name wins.
  const explicit = String(job.voice_style || "").trim().toLowerCase();
  if (AUDIO_VOICES.has(explicit)) return explicit;

  // 2) Map gender/tone cues from the script's voice style to a real voice
  //    (the old code substring-matched the wrong tts-1 set and always fell to
  //    marin — no gender fit, no variety).
  const want = `${job.voice_style || ""} ${script?.voice?.style || ""} ${script?.voice?.pace || ""}`.toLowerCase();
  const has = (...ks) => ks.some((k) => want.includes(k));
  // Gender cues MUST match on word boundaries — substring includes("man")/
  // includes("he ") fired inside "human"/"performance"/"the ", forcing neutral
  // and female-leaning brands onto a male voice before the tone branches ran.
  const FEM  = /\b(female|woman|feminine|she|her|hers)\b/.test(want);
  const MASC = /\b(male|man|masculine|he|him|his)\b/.test(want);
  if (FEM)  return has("warm", "soft", "calm", "gentle") ? "sage" : "coral";
  if (MASC) return has("deep", "authoritative", "bold", "gravitas") ? "cedar" : "ash";
  if (has("energetic", "upbeat", "excited", "punchy", "hype", "playful")) return "ballad";
  if (has("warm", "calm", "soothing", "gentle", "reassuring")) return "sage";
  if (has("elegant", "sophisticated", "premium", "refined", "luxury")) return "verse";
  if (has("bright", "friendly", "cheerful", "approachable")) return "shimmer";
  return "marin"; // a natural, neutral default
}

// ---------------------------------------------------------------- agents
// Each node receives the mutable graph state object and returns a partial
// state update. `s` carries: job, jobDir, tracker, script, brief, and the
// artifacts each agent adds.

// The first installed pack that did NOT style one of the last few videos — the
// deterministic twin of the brief's prompt-level rotation, for when the brief's pick
// is unavailable. Falls back to the plain default when everything is recent (a small
// install) or the store is unreadable.
function rotatedDefaultPack() {
  try {
    const recent = new Set(
      db.listRecent({ limit: 10 }).map((j) => j.framePack).filter(Boolean)
    );
    const fresh = frameRegistry.listPacks().find((p) => !recent.has(p));
    return fresh || null;
  } catch {
    return null;
  }
}

async function frameSelectorAgent(s) {
  // WHOSE CHOICE IS THIS? The question this node exists to answer, and it was asking
  // the wrong column. `job.frame_pack` is NOT the user's pick: intake overwrites it
  // with the brief's suggestion (db.markScriptReview -> db.js setFramePack), so by
  // production every auto job looked hand-picked. Two branches died as a result —
  // the anti-repeat rotation below became unreachable, and the localization reroute
  // took the "honor the user's explicit choice" path for a choice nobody made,
  // shipping non-Latin films on packs that cannot render their text.
  //
  // The user's actual answer is preserved verbatim at create time in
  // intent.preferences.framePack ("auto" or a pack id) — routes/projects.js. Read it
  // there. Jobs created before that field existed fall back to the old reading, so a
  // legacy explicit pick is still honored.
  const userPick = s.job?.intent?.preferences?.framePack;
  const requested = userPick != null
    ? (userPick !== "auto" ? userPick : null)
    : s.job.frame_pack;                      // legacy jobs: no preferences recorded
  const explicit = (requested && requested !== "auto")
    ? frameRegistry.resolvePack(requested)   // valid id → that pack; stale id → null
    : null;
  // The brief's tone-matched suggestion: from this run's brief, or (on a resumed /
  // regenerated job whose brief isn't in state) the one intake persisted. Guarded on
  // a real id — resolvePack(null|"auto") returns the DEFAULT pack, which would make
  // this branch always truthy and re-kill the rotation below.
  const persisted = (s.job.frame_pack && s.job.frame_pack !== "auto") ? s.job.frame_pack : null;
  const fromBrief = frameRegistry.resolvePack(s.brief?.suggestedFramePack)
    || (explicit || !persisted ? null : frameRegistry.resolvePack(persisted));
  // ROTATION. The brief normally carries it: recentlyUsedPacks() feeds the model a
  // `recentFramePacks` list and system_brief.md tells it to prefer a pack that is not
  // in it. But that is a PROMPT instruction on a path that can vanish — if the brief
  // failed, or suggested a pack that has since been uninstalled, we land on
  // resolvePack("auto"), which is a fixed default. Every such video would then wear
  // the same look. Rotate deterministically in exactly that gap.
  const fallback = explicit || fromBrief ? null : rotatedDefaultPack();
  let framePack = explicit || fromBrief || fallback || frameRegistry.resolvePack("auto");
  let via = explicit ? "user" : fromBrief ? "brief" : fallback ? "rotated-default" : "default";

  // ORIENTATION ROUTING — a pack authored for one aspect cannot lay out another. A portrait
  // composer positions vertically as a fraction of HEIGHT and sizes every height as a
  // fraction of WIDTH (cqw, the only definite unit inside an auto-height parent); those two
  // are calibrated against each other at the authored 1080x1920 and nowhere else. Render it
  // at 1920x1080 and heights inflate while the room for them shrinks — measured on
  // organic-garden, the hook's device frame ends 99.2cqw deep in a 56.3cqw-tall frame, a 76%
  // overflow. 22 packs declared `orientation` in pack.json while nothing on this path read
  // it, so nothing prevented that pairing.
  //
  // Same law as the localization reroute below: an auto/brief pick is CORRECTED, an explicit
  // user pick is HONORED and disclosed. Runs first so a swap here is still checked for the
  // charset constraint afterwards.
  let orientationPackWarning = null;
  try {
    const { packFitsOrientation, packOrientation } = require("../services/frame_manifest");
    if (!packFitsOrientation(framePack, s.job.orientation)) {
      const authored = packOrientation(framePack);
      if (via === "user") {
        orientationPackWarning = `The "${framePack}" template is designed for ${authored} video, so parts of its layout can overflow at your chosen ${s.job.orientation} size. Switch the template — or the video size — for a clean fit.`;
        console.warn(`[agents] frame_selector: ${framePack} is authored ${authored} but the job is ${s.job.orientation}; honoring explicit pick with a disclosure`);
      } else {
        const fitting = pickFittingPack(s.brief?.suggestedFramePack, s.job.orientation);
        if (fitting && fitting !== framePack) {
          console.log(`[agents] frame_selector: swapped ${framePack} → ${fitting} (${authored} pack on a ${s.job.orientation} job)`);
          framePack = fitting; via = `${via}+oriented`;
        } else {
          orientationPackWarning = `No installed template is designed for ${s.job.orientation} video, so this film uses a ${authored} one — some scenes may crop or overflow.`;
          console.warn(`[agents] frame_selector: no pack fits ${s.job.orientation}; keeping ${framePack} (${authored}) with a disclosure`);
        }
      }
    }
  } catch (e) { console.warn(`[agents] frame_selector orientation routing skipped: ${e.message}`); }

  // ON-SCREEN LOCALIZATION ROUTING — a non-Latin video-text language cannot render on the
  // canvas/charset packs. If the pack was auto/brief-picked, swap to a clean pack; if the
  // USER explicitly chose one, honor it but flag the localization gap for disclosure.
  let localizationPackWarning = null;
  try {
    // Single source of truth: the Language Director's persisted plan (resolved at intake),
    // not a fourth independent normalizeConfig. Falls back to on-the-fly resolution for
    // legacy/regenerated jobs that predate the plan.
    const plan = languageDirector.getPlan(s.job);
    const vtl = plan.videoTextLanguage;
    const needsFont = vtl && vtl !== captionLang.SOURCE_LANG && !!plan.font;
    if (needsFont && isCanvasOrCharsetPack(framePack)) {
      if (via === "user") {
        localizationPackWarning = `The "${framePack}" template bakes some text into graphics that can't be localized — headings are translated, but its built-in labels stay English.`;
        console.warn(`[agents] frame_selector: ${framePack} can't fully localize on-screen text to ${vtl}; honoring explicit pick with a disclosure`);
      } else {
        const clean = pickCleanPack(s.brief?.suggestedFramePack);
        if (clean && clean !== framePack) {
          console.log(`[agents] frame_selector: swapped ${framePack} → ${clean} for non-Latin on-screen text (${vtl})`);
          framePack = clean; via = `${via}+localized`;
        }
      }
    }
  } catch (e) { console.warn(`[agents] frame_selector localization routing skipped: ${e.message}`); }

  // Persist the pack the film is ACTUALLY rendered in. Until now this node's
  // resolution lived only in graph state, so a localization swap or a rotation never
  // reached the job — and the anti-repeat history (rotatedDefaultPack here,
  // recentlyUsedPacks in brief.js) read a column that only ever held intake's guess.
  try { db.setFramePack(s.job.id, framePack); } catch { /* disclosure never blocks a render */ }

  // The orientation gap is disclosed HERE rather than threaded through graph state: unlike
  // the localization warning — which folds into the Localization Director's report, a node
  // that only runs for a non-English film — this one has no downstream owner and applies to
  // every job. Fail-open (THE LAW): a disclosure never blocks a render.
  if (orientationPackWarning) {
    try { db.setValidationNote(s.job.id, orientationPackWarning); } catch { /* never blocks */ }
  }

  console.log(`[agents] frame_selector → ${framePack} (${via})`);
  return { framePack, localizationPackWarning, orientationPackWarning };
}

async function storyboardAgent(s) {
  db.setProgress(s.job.id, "storyboard");
  const sbPrompt = storyboardPromptFromScript(s.script, s.brief);
  try {
    // The pack is part of the BRIEF for this stage, not decoration: system_storyboard
    // tells the model to design each scene's layout/motif for THIS design system and
    // to keep adjacent scenes visually distinct. Both live callers used to omit it,
    // so that instruction never fired — and "every scene is the same set" is exactly
    // what the QA agent's blocker #11 exists to catch downstream.
    const r = await generateStoryboard({ prompt: sbPrompt, duration: s.job.duration, orientation: s.job.orientation, framePack: s.framePack });
    s.tracker.addLlm({ inputTokens: r.tokensIn, outputTokens: r.tokensOut, stage: "storyboard", model: r.model, provider: r.provider });
    return { storyboard: continuityGate(s, r.storyboard) };
  } catch (e) {
    // FAIL-OPEN — this was the ONLY creative node that could abort the whole graph.
    // The approved script already has validated scenes/timing, so derive a
    // deterministic storyboard from it rather than failing the job. Still bill the
    // tokens the failed attempts spent (generateStoryboard attaches them to err).
    if (Number.isFinite(e?.tokensIn) || Number.isFinite(e?.tokensOut)) {
      // A FAILED attempt still burned tokens. The error carries whatever the last
      // provider reported, so bill it at that provider's rate too.
      s.tracker.addLlm({ inputTokens: e.tokensIn || 0, outputTokens: e.tokensOut || 0, stage: "storyboard", model: e.model || null, provider: e.provider || null });
    }
    console.warn(`[agents] storyboard LLM failed (${String(e?.message || e).slice(0, 140)}) — using deterministic script-derived storyboard`);
    // Disclose the downgrade. Every LLM stage is KIE-only now (grok-4-5 here, with
    // gemini-3-6-flash as the in-KIE fallback), so a KIE outage silently sends EVERY
    // film down this path — the film still ships, but without the model's
    // motifs/emphasis, and nobody could see that from the outside.
    try {
      db.setValidationNote(s.job.id, "The scene designer was unavailable, so the film was built from the approved script's own structure — timing and copy are exactly as you approved, but the per-scene visual motifs are the template's defaults.");
    } catch { /* disclosure never blocks a render */ }
    return { storyboard: continuityGate(s, storyboardFromScript(s.script, s.job, s.brief)) };
  }
}

// CONTINUITY GATE — the storyboard must describe the film the user approved. The
// script owns structure (ids/order/timing/copy), the storyboard owns enrichment
// (kind/animation/motif/beats). Deterministic, fail-open, and disclosed when it has to
// correct something. See services/continuity.js for why this class of drift is audible.
function continuityGate(s, storyboard) {
  try {
    const { storyboard: fixed, report } = reconcileStoryboard({ storyboard, script: s.script });
    if (report.changed) {
      console.warn(`[agents] continuity: ${report.notes.join(" | ")}`);
      try { db.setContinuityReport(s.job.id, report); } catch { /* best effort */ }
    } else {
      console.log(`[agents] continuity: storyboard matches the approved script (${report.sceneCount.script} scenes)`);
    }
    return fixed;
  } catch (e) {
    console.warn(`[agents] continuity check skipped: ${e.message}`);
    return storyboard;
  }
}

// Scene Planner — guarantees every storyboard scene has executable beats.
// Deterministic: derives default beats from the script when the model
// omitted them (entrance at 0.1, content at 30%, exit 0.6s before handoff).
async function scenePlannerAgent(s) {
  const sb = s.storyboard;
  let derived = 0;
  for (const scene of sb.scenes || []) {
    if (!Array.isArray(scene.beats) || !scene.beats.length) {
      scene.beats = [
        { at: 0.1, action: "scene content enters", easing: "expo.out" },
        { at: Math.round(scene.duration * 0.3 * 100) / 100, action: "supporting content lands", easing: "power2.out" },
        { at: Math.max(0.2, scene.duration - 0.6), action: "exit begins / hand-off", easing: "power2.in" },
      ];
      derived++;
    }
  }
  if (derived) console.log(`[agents] scene_planner derived beats for ${derived} scene(s)`);
  return { storyboard: sb };
}

// Asset Planner — turns the approved script's needs into a concrete want-list
// (user uploads pinned FIRST, website screenshots second, stock wants after,
// caps applied). The tier law starts here: the user's own images take the
// showcase scenes before anything the pipeline captured or will fetch.
async function assetPlannerAgent(s) {
  const { job, script } = s;
  const videoOk = hasProviderFor("video");
  // Can the CHOSEN pack's composer render a vector in a scene slot? Drives the
  // gap-fill below — asking for assets the composer will discard is how scenes
  // ended up blank. See frame_manifest.packAcceptsVectors.
  const acceptsVectors = require("../services/frame_manifest").packAcceptsVectors(s.framePack);
  if (!acceptsVectors) console.log(`[agents] asset_planner: pack "${s.framePack}" renders photos/screenshots only — vector gap-fill routed to photos`);

  // DURATION-ADAPTIVE BUDGET — how many stock assets this film should collect, scaled by
  // runtime + scene count (was fixed 8 vectors / 12 photos / 2 video regardless of length,
  // so long films starved). Owned pins (uploads/screenshots/brand) are additive and never
  // reduced below today's baselines. Pure/deterministic; see services/asset_budget.js.
  const hasUploads = (job.user_assets || []).some((u) => u && u.role !== "logo");
  const budget = computeAssetBudget({ durationSec: job.duration, sceneCount: script.scenes.length, hasUploads, videoOk });
  console.log(`[agents] asset_budget → ${budget.total} stock (${budget.maxPhotos} photo / ${budget.maxVectors} vector / ${budget.maxVideos} video) for ${job.duration}s · ${script.scenes.length} scenes`);

  // USER UPLOADS — tier 100. Pinned by reference (files already live in
  // jobs/<id>/uploads/), screenshot-like ones leading, round-robin over the
  // showcase scenes. Fail-open: a swept/missing manifest pins nothing.
  const userPins = await pinUserAssets({ job, script, jobDir: s.jobDir, maxPins: budget.maxUploads });

  const shots = (job.website_screenshots || []).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
  // Showcase targeting is now role-based and shared (services/scene_role): it already
  // folds in the mid-scene fallback AND the 2-scene fallback (slice(1,-1) is EMPTY
  // there, which once silently dropped every real screenshot), and it no longer misses
  // a scene the script labelled "benefit"/"the problem" instead of "feature".
  // Website screenshots fill the showcase scenes the uploads did NOT take — fewer when
  // uploads exist (the user's own material is the show), and more on longer films. Sized
  // by the duration budget (was a fixed 2/3).
  const websiteCap = budget.maxScreenshots;
  const targets = showcaseTargets(script)
    .filter((x) => !userPins.usedSceneIds.has(x.id))
    .slice(0, websiteCap);
  const screenshotPlan = shots.slice(0, targets.length).map((src, i) => ({ kind: "screenshot", src, scene: targets[i], index: i }));
  const pinnedSceneIds = new Set([...userPins.usedSceneIds, ...screenshotPlan.map((p) => p.scene.id)]);

  // HARVESTED WEBSITE BRAND ASSETS (tier-90 logo + tier-70 imagery) — pin the site's
  // OWN visuals to showcase scenes the uploads/screenshots didn't take. Fewer when the
  // user gave uploads (their material leads). Fail-open inside pinWebsiteAssets.
  const brandPins = await pinWebsiteAssets({
    job, script, jobDir: s.jobDir, usedSceneIds: pinnedSceneIds,
    hasUploadLogo: !!userPins.logoAsset, maxPins: budget.maxBrand, acceptsVectors,
  }).catch((e) => { console.warn(`[agents] pinWebsiteAssets failed: ${e.message}`); return { brandPinned: [], brandLogo: null }; });
  for (const a of brandPins.brandPinned) if (a.sceneId) pinnedSceneIds.add(a.sceneId);

  // Derive a concrete image query from a scene's visualDirection when the
  // script asked for nothing — substance scenes should never go imageless.
  const STOP = new Set(["the", "a", "an", "with", "and", "of", "in", "on", "over", "into", "across", "as", "to", "that", "then", "while", "for", "is", "are", "we", "see", "scene", "text", "headline", "screen"]);
  const deriveQuery = (scene) => {
    const words = String(scene.visualDirection || "").toLowerCase().match(/[a-z]{3,}/g) || [];
    const picked = words.filter((w) => !STOP.has(w)).slice(0, 4);
    return picked.length >= 2 ? picked.join(" ") : null;
  };

  const VECTOR_ROLES = new Set(["icon", "texture", "vector"]);
  const roleOf = (n) => String(n.role || "").toLowerCase();

  const wants = [];
  for (const scene of script.scenes) {
    const needs = [...(scene.assetNeeds || [])];
    // Gap-fill: EVERY scene with no asset request gets a derived one (hook/cta
    // included — dense visuals everywhere beats sparse pure-typography beats).
    if (!needs.length && !pinnedSceneIds.has(scene.id)) {
      const q = deriveQuery(scene);
      if (q) {
        // Scene ROLE → asset KIND (asset_taxonomy.PURPOSE_KIND): proof/quote→people,
        // feature/how→screenshot, cta→icon, hook/context→photo. Keyed off the CANONICAL
        // role rather than the raw purpose string, which missed every synonym the model
        // invented. Fail-open: an unknown role falls back to "photo". This is a
        // ranking/routing bias, never a hard filter — a scene is never left imageless.
        const wantKind = kindForPurpose(roleOf(scene));
        if (wantKind === "vector" || wantKind === "icon") {
          // Route data/cta scenes into the vector pool (kindPrefFor("icon") → vector).
          needs.push({ type: "image", query: q, role: "icon", derived: true });
        } else {
          // photo / screenshot / people → a background photo, with a light people bias
          // for proof/testimonial scenes so they stop pulling generic backgrounds.
          const pq = wantKind === "people" ? `${q} people` : q;
          needs.push({ type: "image", query: pq, role: "background", derived: true });
          // Alternate scenes also pull a photo inset for variety.
          if (script.scenes.indexOf(scene) % 2 === 1) {
            needs.push({ type: "image", query: pq, role: "inset", derived: true });
          }
        }
      }
    }
    // VECTOR GAP-FILL — the curated SVG library is only worth tapping on a pack
    // whose composer can actually RENDER a vector in a scene slot. It guarantees
    // every scene has graphic material to layer on the scene-kit; on a dedicated
    // native pack the same request fetched an asset the composer discards at its
    // `.svg → return false` gate, so the scene it was meant to fill rendered an
    // empty placeholder instead. (Audited film: 5 of 9 assets dead on arrival,
    // 3 of 7 scenes blank.) See frame_manifest.packAcceptsVectors.
    //
    // On a vector-blind pack we spend that slot on a SECOND PHOTO instead, so the
    // scene still gets a renderable visual — the point of the gap-fill was never
    // "an icon", it was "never leave a scene with nothing".
    if (!needs.some((n) => VECTOR_ROLES.has(roleOf(n)))) {
      const q = deriveQuery(scene) || (scene.assetNeeds && scene.assetNeeds[0] && scene.assetNeeds[0].query) || null;
      if (q) {
        if (acceptsVectors) {
          needs.push({ type: "image", query: q, role: "icon", derived: true });
        } else if (!needs.length && !pinnedSceneIds.has(scene.id)) {
          needs.push({ type: "image", query: q, role: "background", derived: true });
        }
      }
    }
    for (const need of needs) {
      if (pinnedSceneIds.has(scene.id) && need.role === "background") continue;
      const type = need.type === "video" && !videoOk ? "image" : need.type;
      wants.push({ kind: "search", scene, need: { ...need, type } });
    }
  }
  // A need is a vector if its ROLE is icon/texture/vector OR its script TYPE is
  // "icon" (the script schema allows type:"icon" with any role; keying only off
  // role missed those and fetched explicitly-requested icons as photos).
  const isVectorNeed = (n) => VECTOR_ROLES.has(roleOf(n)) || n.type === "icon";
  // A vector-blind pack also can't use the SCRIPT-authored icon needs. Convert them
  // to photo needs rather than spending the fetch on something the composer drops,
  // and hand the vector budget to photos so the film gets MORE renderable material,
  // not less.
  if (!acceptsVectors) {
    let converted = 0;
    for (const w of wants) {
      if (w.need.type === "video" || !isVectorNeed(w.need)) continue;
      w.need = { ...w.need, type: "image", role: w.need.role === "inset" ? "inset" : "background", __wasVector: true };
      converted++;
    }
    if (converted) {
      budget.maxPhotos += Math.min(budget.maxVectors, converted);
      budget.maxVectors = 0;
      console.log(`[agents] asset_planner: converted ${converted} vector need(s) to photo needs for "${s.framePack}" (photo budget → ${budget.maxPhotos})`);
    }
  }
  const videos = wants.filter((w) => w.need.type === "video").slice(0, budget.maxVideos);
  // Vectors get their OWN budget so a long photo list can't starve them — this
  // is what finally feeds the curated SVG library into films. All three caps now
  // scale with the duration budget (were fixed 2 / 8 / 12).
  const vectors = wants.filter((w) => w.need.type !== "video" && isVectorNeed(w.need)).slice(0, budget.maxVectors);
  const photos  = wants.filter((w) => w.need.type !== "video" && !isVectorNeed(w.need)).slice(0, budget.maxPhotos);
  console.log(`[agents] asset_planner: ${userPins.pinned.length} upload(s)${userPins.logoAsset ? " + logo" : ""} + ${screenshotPlan.length} screenshot(s) + ${videos.length} video(s) + ${photos.length} photo(s) + ${vectors.length} vector(s) (${wants.filter((w) => w.need.derived).length} derived)`);
  return { assetPlan: { userAssets: userPins.pinned, logo: userPins.logoAsset, brandAssets: brandPins.brandPinned, brandLogo: brandPins.brandLogo, screenshots: screenshotPlan, searches: [...videos, ...photos, ...vectors] } };
}

// Asset Search — executes the plan: our database first, then providers.
// Stopwords for the topical anchor — drop the brand name and generic filler so
// the anchor is the SUBJECT (beauty, cosmetics), not "bulkdoor"/"marketplace".
const ANCHOR_STOP = new Set([
  "the", "and", "for", "with", "your", "our", "that", "this", "from", "into",
  "india", "indias", "best", "top", "leading", "number", "online", "platform",
  "marketplace", "website", "company", "brand", "brands", "business", "solution",
  "solutions", "service", "services", "app", "get", "now", "more", "all", "new",
  "buy", "shop", "store", "official", "home", "page", "welcome", "trusted",
  // film-language + filler adjectives that hijacked the anchor ("their cinematic"):
  "their", "they", "them", "every", "everyone", "each", "cinematic", "dramatic",
  "epic", "story", "storytelling", "film", "films", "video", "videos", "launch",
  "promo", "journey", "world", "experience", "discover", "transform", "moment",
  "moments", "ordinary", "extraordinary", "premium", "beautiful", "stunning",
  "slow", "motion", "fast", "modern", "future", "power", "powerful", "make",
  "makes", "making", "turn", "turns", "star", "hero", "feel", "feels", "life",
]);

// 1-2 SUBJECT words distilled from the brief/site, used to keep derived stock
// queries on-topic. Without this, abstract scene directions ("scalable growth")
// fetched wildly off-topic stock (trading charts, a car logo) because the query
// never carried what the video is actually about.
function topicAnchor(job, brief) {
  // The brief's grounded `subject` field is authoritative when present — it is
  // written to be literal and shootable ("golden retriever dog"). The frequency
  // heuristic below is only the fallback for older briefs, and it once produced
  // anchors like "their cinematic" before the stopword list grew.
  const subject = String(brief?.subject || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
  if (subject) return subject.split(/\s+/).slice(0, 5).join(" ");
  const src = `${(brief?.keyMessages || []).join(" ")} ${brief?.audience || ""} ${brief?.goal || ""}`.toLowerCase();
  const freq = {};
  for (const w of src.match(/[a-z]{4,}/g) || []) {
    if (!ANCHOR_STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]).join(" ");
}

async function assetSearchAgent(s) {
  const { job, jobDir, tracker, assetPlan } = s;
  const anchor = topicAnchor(job, s.brief);
  if (anchor) console.log(`[agents] asset_search topic anchor: "${anchor}"`);
  // Pack-aware styling: photo queries get the pack's look, icons get its accent
  // color + matching Iconify collection family. Bridges to the Phase 3 manifest.
  const packStyle = styleFor(s.framePack);
  const packTokens = s.framePack ? frameRegistry.getPackTokens(s.framePack) : null;
  const iconColor = iconColorFor(packTokens);
  if (packStyle.photoMod) console.log(`[agents] asset_search pack style: "${packStyle.photoMod}" · icons=${packStyle.iconStyle}${iconColor ? ` (${iconColor})` : ""}`);
  db.setProgress(job.id, "assets");
  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "assets", "videos"), { recursive: true });

  const pinned = await Promise.all(assetPlan.screenshots.map(async ({ src, scene, index }) => {
    const relPath = `assets/images/site_${index}.png`;
    const absPath = path.join(jobDir, relPath);
    fs.copyFileSync(src, absPath);
    // Probe the REAL pixel dimensions (ffprobe — no native dep; ffmpeg is already a
    // hard dep) so the Visual Layout Director can aspect-route the shot: a portrait
    // (mobile) capture gets a phone mockup, a wide desktop capture a browser frame.
    // Pinned screenshots used to ship without width/height/ratio, so deviceKind()
    // defaulted every one to "browser". Fail-safe: no probe → no ratio → browser.
    const dim = await ffprobeImage(absPath).catch(() => null);
    const ratio = dim && dim.width && dim.height ? Math.round((dim.width / dim.height) * 1000) / 1000 : undefined;
    const framed = ratio && ratio < 0.9 ? "phone" : "browser";
    return {
      path: relPath, type: "image", sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: "inset",
      width: dim ? dim.width : undefined, height: dim ? dim.height : undefined, ratio,
      alt: `REAL website screenshot of ${job.website_title || "the product"} (${index === 0 ? "homepage hero" : `page section ${index + 1}`}) — present in a styled ${framed} frame with hero treatment`,
      license: "owner content", sourceUrl: job.intent?.websiteUrl || null, source: "website", fromCache: false,
    };
  }));

  // Map a scene's asset role to the kind of curated asset that fits it:
  // full-bleed backgrounds want real photos; insets/icons/textures want
  // vectors or illustrations. Threaded into acquire() -> curated.search.
  const kindPrefFor = (role) => {
    const r = String(role || "").toLowerCase();
    if (r === "background" || r === "fullscreen") return "photo";
    if (r === "icon" || r === "texture") return "vector";
    if (r === "inset") return "illustration";
    return undefined;
  };

  // The user's uploads (pinned by the planner, files already in jobs/<id>/uploads/)
  // plus their logo — tier 100, ahead of everything below.
  const userPinned = [
    ...(assetPlan.userAssets || []),
    ...(assetPlan.logo ? [assetPlan.logo] : []),
  ];
  // Harvested website brand assets (logo tier 90 + imagery tier 70) — the site's OWN
  // visuals, above screenshots/stock, below the user's uploads. Files already live in
  // jobs/<id>/ingest/brand_assets/ (planner assigned scenes; no copy needed).
  const brandPinned = [
    ...(assetPlan.brandLogo ? [assetPlan.brandLogo] : []),
    ...(assetPlan.brandAssets || []),
  ];

  // Sequential so each curated pick can exclude the library files already
  // chosen for earlier scenes — no single film reuses the same file twice.
  const usedLibraryIds = new Set();
  // De-dup acquired images by EXACT (MD5) + PERCEPTUAL (dHash) match: several
  // similar queries resolve to the same — or a visually-identical re-encode of
  // the same — stock image, which was being saved as 0.jpg/1.jpg/2.jpg… and
  // shown 4× in the montage. Seed with the pinned assets so stock can't
  // duplicate one of them either — UPLOADS FIRST: seeding order decides who
  // survives a collision, and a site capture that duplicates the user's own
  // upload must be the copy that drops.
  const deduper = makeImageDeduper();
  for (const a of userPinned) { if (a && a.path) { try { await deduper.add(path.join(jobDir, a.path)); } catch { /* noop */ } } }
  // Seed harvested brand assets BEFORE stock too, so a stock photo that visually
  // duplicates the site's own hero is the copy that drops (uploads > brand > stock).
  for (const a of brandPinned) { if (a && a.path) { try { await deduper.add(path.join(jobDir, a.path)); } catch { /* noop */ } } }
  for (const a of pinned) { if (a && a.path) { try { await deduper.add(path.join(jobDir, a.path)); } catch { /* noop */ } } }
  // Operator override: with web stock forced off, PHOTO needs come only from the
  // curated library (or the real screenshots) — no random/off-brand stock. Web
  // vectors/icons (usually clean flat art) still reach the web.
  const forceCurated = process.env.CURATED_ONLY_IMAGES === "1";
  let iImg = 0, iVid = 0;
  const results = [];
  // Web-stock assets to run through the vision relevance gate AFTER the fetch
  // loop, in one batched call rather than one LLM call per asset.
  const pendingGate = [];
  for (const { scene, need } of assetPlan.searches) {
    const isVideo = need.type === "video";
    const relPath = isVideo ? `assets/videos/${iVid++}.mp4` : `assets/images/${iImg++}.jpg`;
    // type:"icon" OR role icon/texture -> want a curated vector. Do NOT append
    // "icon flat" to the query: that suffix trips the curated library's 0.5
    // relevance gate and zeroes its SVG hits — kindPref:"vector" already routes
    // to the SVG library on the concrete subject query.
    const isIcon = need.type === "icon" || ["icon", "texture"].includes(String(need.role || "").toLowerCase());
    // Anchor PHOTO/background queries to the video's subject so a derived
    // direction like "scalable growth" becomes "beauty cosmetics scalable
    // growth" — on-topic stock instead of trading charts. Icons/vectors keep
    // their concrete query (anchoring an abstract shape rarely helps).
    // The search query is the SUBJECT (anchor + concrete need). The pack's visual
    // style is applied at RANK time via styleKeywords and at render time as a
    // treatment — NOT concatenated into the search text (that overflowed provider
    // length limits and diluted the subject). See asset_sources query hygiene.
    const query = (!isIcon && anchor) ? `${anchor} ${need.query}` : need.query;
    const r = await acquire({
      query,
      fallbackQueries: [...new Set([need.query, ...fallbackQueriesFor(query)])],
      type: isVideo ? "video" : "image",
      orientation: job.orientation, outputPath: path.join(jobDir, relPath), tracker,
      kindPref: isVideo ? undefined : (isIcon ? "vector" : kindPrefFor(need.role)),
      excludeIds: usedLibraryIds,
      curatedOnly: forceCurated && !isVideo && !isIcon,
      iconColor: isIcon ? iconColor : undefined,
      iconStyle: isIcon ? packStyle.iconStyle : undefined,
      styleKeywords: !isIcon ? packStyle.keywords : undefined,
    }).catch(() => null);
    if (!r) continue;
    // Skip an asset we've already used — byte-identical OR visually a duplicate
    // (a different re-encode/crop of the same picture), which MD5 alone missed.
    if (!isVideo) {
      const dup = await deduper.check(r.path, r.dhash);
      if (dup) {
        console.log(`[agents] dropped ${dup}-duplicate asset — query "${need.query}"`);
        try { fs.unlinkSync(r.path); } catch { /* noop */ }
        continue;
      }
    }
    if (r.libraryId) usedLibraryIds.add(r.libraryId);
    const resultObj = {
      path: path.relative(jobDir, r.path).split(path.sep).join("/"), type: isVideo ? "video" : "image",
      sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: need.role === "inset" ? "inset" : "background", alt: need.query,
      width: r.width, height: r.height, ratio: r.ratio, hasAlpha: r.hasAlpha,
      // dhash + dominantColor are COMPUTED for every fetched image (asset_sources/util
      // validateImage runs an ffmpeg pass for each) and were dropped right here, one
      // line before their consumers: scene_kit orders a scene's assets by palette
      // affinity off `dominantColor` (scene_kit.js paletteAffinity) and read neutral
      // for every asset, and nothing downstream could dedup or cache by hash. Carrying
      // them costs nothing — the work was already done and thrown away.
      dhash: r.dhash, dominantColor: r.dominantColor,
      license: r.license, sourceUrl: r.sourceUrl, source: r.source, fromCache: r.fromCache === true,
    };
    results.push(resultObj);
    // Defer the vision gate, classified by ACTUAL SOURCE (not role): every real
    // stock provider is gated — including Pixabay bridge VECTORS (source
    // "pixabay"), which are arbitrary illustrations (a cartoon tooth/syringe slips
    // through otherwise). Curated picks, real website screenshots, and clean
    // recolored Iconify SVGs (source "iconify") stay trusted and skip the gate.
    const STOCK_SOURCES = new Set(["pixabay", "openverse", "pexels", "pixabay_scrape"]);
    const isWebStock = STOCK_SOURCES.has(String(r.source || ""));
    if (isWebStock) pendingGate.push({ resultObj, absPath: r.path, type: isVideo ? "video" : "image", query: need.query });
  }

  // VISION RELEVANCE GATE (batched) — "would a director accept this for a film
  // about <subject>?" over ALL fetched web stock in as few calls as possible
  // (chunks of 6) instead of one LLM call per asset. Fail-open: a dead budget or
  // any error keeps every asset, so the gate can never starve a film of visuals.
  // SUPERSEDED by the creative_director node when enabled — it runs a richer
  // review (scores + scene assignment + prominence) on all assets next. Skip this
  // simpler keep/reject gate then, to avoid double vision cost. Kept as the
  // fallback when CREATIVE_DIRECTOR=0.
  const gateSubject = (s.brief?.subject || anchor || "").trim();
  if (!config.creativeDirector.enabled && pendingGate.length && gateSubject) {
    const verdicts = await checkAssetsRelevance({
      assets: pendingGate.map((p) => ({ absPath: p.absPath, type: p.type, query: p.query })),
      subject: gateSubject, tracker,
    });
    verdicts.forEach((v, i) => {
      const p = pendingGate[i];
      if (!v.keep) {
        console.warn(`[agents] asset REJECTED by vision gate (shows "${v.sees || "?"}", film is about "${gateSubject}") — query "${p.query}"`);
        try { fs.unlinkSync(p.absPath); } catch { /* noop */ }
        const idx = results.indexOf(p.resultObj);
        if (idx >= 0) results.splice(idx, 1);
      } else if (v.sees) {
        // Mark the asset as VERIFIED on-topic (the model actually looked at it
        // and approved). scene_kit only admits verified/owned/curated assets to
        // PROMINENT slots (montage tiles, split art) — a fail-open pass (gate
        // error, no `sees`) stays unverified and is kept for scrim B-roll only.
        p.resultObj.visionOk = true;
        p.resultObj.sees = v.sees;
        console.log(`[agents] asset ok (vision: "${v.sees}") — ${p.query}`);
      }
    });
  }
  const got = results;

  // Tier order on the wire too: uploads, then harvested brand assets, then website
  // captures, then fetched (rankKey re-sorts for slot competition; this sets find(isLogo)
  // precedence — an uploaded logo, listed first, wins over a harvested one).
  const assets = [...userPinned, ...brandPinned, ...pinned, ...got];
  db.setAssets(job.id, assets);
  console.log(`[agents] asset_search: ${assets.length} asset(s) (${userPinned.length} user upload(s), ${got.filter((a) => a.fromCache).length} from cache)`);
  return { assets };
}

// Creative Director — the final creative authority before composition. Reviews,
// scores, re-ranks, and scene-assigns every collected asset; can do one bounded
// top-up fetch. Supersedes the simple relevance gate in asset_search. Fail-open:
// returns the assets unchanged on any error, so it never blocks production.
async function creativeDirectorAgent(s) {
  if (!config.creativeDirector.enabled) return {};
  const { job, jobDir, tracker } = s;
  db.setProgress(job.id, "creative_review");
  // Duration-adaptive CD top-up ceiling (completes the asset_budget story): a longer film
  // may fetch more net-new gap-fillers than the fixed default. Recomputed here (pure) so it
  // stays in sync with assetPlannerAgent without threading extra graph state.
  const hasUploads = (job.user_assets || []).some((u) => u && u.role !== "logo");
  const { cdMaxTopUp } = computeAssetBudget({ durationSec: job.duration, sceneCount: (s.script?.scenes || []).length, hasUploads, videoOk: hasProviderFor("video") });
  // The director's SOUNDTRACK verdict, captured in-band. It reviews the planned music
  // and SFX against the film's subject; that opinion previously went to the database
  // and no further, so the Audio Director — the one agent that could act on it — never
  // saw it and planned the whole mix without knowing whether the bed even fits.
  let audioAdvice = null;
  const curated = await reviewAndCurate({
    jobId: job.id,
    storyboard: s.storyboard,
    script: s.script,
    subject: s.brief?.subject || null,
    brief: s.brief,
    framePack: s.framePack,
    assets: s.assets || [],
    tracker,
    jobDir,
    orientation: job.orientation,
    maxTopUp: cdMaxTopUp,
    onReview: (report) => {
      audioAdvice = { music: report.musicAnalysis || null, sfx: report.soundEffectAnalysis || null };
    },
  });
  db.setAssets(job.id, curated);
  return { assets: curated, audioAdvice };
}

// Art Director — decides WHICH palette the film is allowed to wear, then turns it into
// an ACCENT-ONLY brand skin so the composition reads on-brand instead of the frame
// pack's stock palette. Runs in parallel with the storyboard/asset/voice chain (it only
// needs the job + brief + the chosen pack); the skin joins at composition. Fail-open:
// any failure returns a null skin → the pack keeps its own accents, so it never blocks
// a render or makes a video worse.
//
// SOURCE PRECEDENCE (user > logo > extracted > inferred). The candidate palettes are not
// equally true, and this node is the only place that can tell them apart:
//   explicit  — job.brand_palette, the user's own primary/secondary/accent. A decision.
//   logo      — intent.logo.brandColors, quantized off the user's UPLOADED logo. Real
//               pixels of the AUTHORED mark — cleaner than photography, so it outranks
//               the website hero when both exist.
//   extracted — intent.website.brandColors, quantized off the real hero screenshot.
//               RAW and pre-LLM: the product's actual colors, but unlabeled buckets.
//   inferred  — brief.brandColors, an LLM OUTPUT. system_brief.md licenses the model to
//               INVENT hexes when no website exists and brief.js validates hex SHAPE
//               only, so a prompt-only job's "brand colors" are a plausible fiction.
// Reading only the brief (as this did) meant a prompt-only job was confidently skinned
// in hallucinated color while art_director's own prompt forbids inventing colors.
async function artDirectorAgent(s) {
  // ART_DIRECTOR=0 is the operator's kill switch for brand skinning as a whole — an
  // explicit palette included, since the flag exists to take brand color off the table
  // when a composer regresses, not merely to silence one model call.
  if (!config.artDirector?.enabled) return { brandSkin: null };

  const bp = s.job?.brand_palette || null;
  const explicit  = bp ? [bp.primary, bp.secondary, bp.accent].filter(Boolean) : [];
  const logo      = s.job?.intent?.logo?.brandColors || [];
  const extracted = s.job?.intent?.website?.brandColors || [];
  const inferred  = s.brief?.brandColors || [];

  // ACHROMATIC GUARD. Source precedence assumes each candidate palette is a real
  // claim about the brand — but an explicit {#0a0a0a, #ffffff} is a UI default
  // nobody touched, not a decision that the film should be greyscale. Honouring it
  // verbatim (the explicit tier skips the LLM by design) is how the audited film
  // shipped a monochrome grey city while the site's own lavender sat unused in
  // intent.website.brandColors.
  //
  // So an explicit palette with NO chromatic stop steps aside for the first source
  // that has one. It is not discarded: a genuinely monochrome brand (nothing
  // chromatic anywhere) still gets its exact pick, and the fall-through is
  // disclosed rather than silent.
  const { isChromatic } = require("../services/brand_kit");
  let colorless = null;
  let candidates = [
    [explicit, "explicit"], [logo, "logo"], [extracted, "extracted"], [inferred, "inferred"],
  ];
  if (explicit.length && !isChromatic(explicit)) {
    const rescue = [logo, extracted].find((c) => c.length && isChromatic(c));
    if (rescue) {
      colorless = explicit;
      candidates = candidates.filter(([, name]) => name !== "explicit");
      console.warn(`[agents] art_director: explicit palette ${explicit.join(",")} carries no colour — deferring to the ${rescue === logo ? "logo" : "site-extracted"} palette`);
    }
  }
  const hit = candidates.find(([c]) => c.length) || [[], "inferred"];
  const [brandColors, provenance] = hit;

  // An unbranded video should LOOK unbranded. Inferred hexes are the brief model's
  // taste, not the product's identity: skinning a pack in invented color buys nothing
  // the pack's own designed accents don't already do better, and paying a second model
  // to art-direct the first model's guess buys even less. The pack keeps its accents.
  if (provenance === "inferred" || !brandColors.length) return { brandSkin: null };

  db.setProgress(s.job.id, "art_direction");

  // A manual primary+secondary pick has ALREADY answered the only question the LLM is
  // asked ("which of these should lead?"), so an explicit palette is honored verbatim
  // and deterministically: no latency, no cost, and no chance of the model's skip-veto
  // discarding the colors the user chose by hand.
  if (provenance === "explicit") {
    const brandSkin = defaultBrandSkin(brandColors, { provenance });
    persistBrandReview(s.job.id, brandSkin, s.framePack);
    console.log(`[agents] art_director → ${brandSkin ? brandSkin.accents.join(", ") : "none"} (explicit palette — no LLM)`);
    return { brandSkin };
  }

  const brandSkin = await directBrand({
    jobId: s.job.id,
    brandColors,
    provenance,
    // Disclosure: the user's own pick was set aside because it carried no colour.
    supersededPalette: colorless,
    subject: s.brief?.subject || null,
    brief: s.brief,
    framePack: s.framePack,
    packVibe: s.framePack ? frameRegistry.getPackVibe(s.framePack) : null,
    tracker: s.tracker,
  }).catch((e) => { console.warn(`[agents] art_director failed: ${e.message}`); return null; });
  return { brandSkin };
}

// Visual Layout Director — the composition authority (promoted from the pure-JS
// layout planner). It does NOT pick assets (the Creative Director did that); it
// decides their PRESENTATION by reusing the CD's per-asset scores: how many appear
// prominently (quality over quantity — demote the weak overflow to B-roll), the
// hero size (enlarge for readability), the montage tile budget (fewer, larger), and
// per-asset content-aware crop focus — plus the base archetype typing. Deterministic
// (no LLM). Runs after the CD (needs the scored assets); its re-leveled assets +
// layout plan feed composition. Fail-open: on any error the kit's own logic runs.
async function visualLayoutDirectorAgent(s) {
  db.setProgress(s.job.id, "layout_direction");
  const { assets, layoutPlan, review } = directLayout({
    storyboard: s.storyboard,
    script: s.script,
    assets: s.assets || [],
    framePack: s.framePack,
    dims: { width: s.job.width, height: s.job.height, fps: s.job.fps },
  });
  if (review) { try { db.setLayoutReview(s.job.id, review); } catch { /* best effort */ } }
  try { db.setAssets(s.job.id, assets); } catch { /* best effort */ }
  return { assets, layoutPlan };
}

// Asset Reuse Optimizer — the last stage of asset intelligence, and the only one allowed
// to make an asset appear twice.
//
// The Visual Layout Director's spreadAcrossScenes already gives every scene one asset
// before any scene gets two, but it MOVES assets and never duplicates them, so its coverage
// ceiling is min(assets, scenes): a six-asset film with nine scenes leaves three scenes with
// nothing, however well everything upstream ranks. This node closes exactly that gap — it
// scores every approved asset against each uncovered scene (semantic fit, quality, scene
// distance, visual diversity, usage headroom, aspect, composition) and clones the winner
// onto it, under a hard per-asset usage ceiling with an adjacency veto.
//
// Runs after the layout director (it needs the final placements) and before composition.
// Deterministic and free — no LLM, no vision, no I/O — so it adds no measurable latency.
// Fail-open: on any error the wire is returned untouched.
async function assetReuseAgent(s) {
  if (!config.assetReuse?.enabled) return {};
  db.setProgress(s.job.id, "asset_reuse");
  const { optimizeAssetReuse } = require("../services/asset_reuse");
  const { assets, review } = optimizeAssetReuse({
    assets: s.assets || [],
    script: s.script,
    storyboard: s.storyboard,
    framePack: s.framePack,
    dims: { width: s.job.width, height: s.job.height },
    // Native packs place by sceneId across their own display beats; the scene-kit weave
    // only reaches CONTENT scenes. The slot model differs, so the composer family is part
    // of the question — see asset_reuse.buildSlots.
    native: !!rendererOf(s.framePack),
    // The renderer id, not just "is it native": WHICH scene roles can draw a picture
    // differs per composer (om_stage's hook draws one, prisma's does not).
    renderer: rendererOf(s.framePack) || null,
    acceptsVectors: require("../services/frame_manifest").packAcceptsVectors(s.framePack),
    seedKey: s.job.id,          // same per-job salt the scene-kit uses for layout variety
  });
  if (review) {
    try { db.setAssetReuseReport(s.job.id, review); } catch { /* disclosure never blocks a render */ }
    try { db.setAssets(s.job.id, assets); } catch { /* best effort */ }
    console.log(`[agents] asset_reuse → ${review.assetCoverage} of ${review.slotsDemanded} slot(s) covered `
      + `(${review.slotsFilledUnique} unique, ${review.slotsFilledReuse} reuse, ${review.slotsFilledDecorative} decorative)`
      + (review.reusedAssets ? ` · ${review.reusedAssets} asset(s) reused, max ${review.maximumReuseCount}×` : ""));
  }
  // The review rides graph state (not just the DB) so the QA reviewer can be told which
  // pictures recur ON PURPOSE — it is the only stage that can check whether the re-styling
  // actually reads as different, because that is a question about pixels.
  return { assets, assetReuse: review || null };
}

// Localization Director — translates the storyboard's ON-SCREEN text (headline, subtext,
// bullets, onScreenText, emphasis, and the film title) into the VIDEO-TEXT language so
// the film reads as designed-in-language rather than translated-after. Runs AFTER the
// storyboard is fully built (it needs the on-screen strings) and after the Caption
// Director (which resolved videoTextLanguage). It MUTATES the storyboard scenes in place
// — they flow by reference into composition. Fully fail-open: any failure leaves English
// text and discloses it. No-op when the video-text language is the source (English).
async function localizationDirectorAgent(s) {
  const plan = s.captionPlan;
  const vtl = plan && plan.videoTextLanguage;
  if (!vtl || vtl === captionDirector.SOURCE_LANG || !s.storyboard) return {};
  db.setProgress(s.job.id, "localization");
  const report = await captionDirector.localizeStoryboardText({
    storyboard: s.storyboard,
    videoTextLanguage: vtl,
    videoTextLanguageName: plan.videoTextLanguageName,
    textStyle: plan.captionStyle && plan.captionStyle.text,
    // The CHOSEN pack's fixed strings (KICK kickers, fallback CTAs) — translated in the
    // same batch and returned as localizedStrings for the composer to overlay.
    extraStrings: composerStringsFor(s.framePack),
    brief: s.brief, job: s.job, script: s.script, tracker: s.tracker,
    glossary: languageDirector.getPlan(s.job).glossary,   // same brand/tech protection as the VO/caption pass
  }).catch((e) => { console.warn(`[agents] localization_director failed: ${e.message}`); return null; });
  if (report) {
    // Fold in the explicit-canvas-pack disclosure from the frame selector, if any.
    if (s.localizationPackWarning) {
      report.notes = [...(report.notes || []), s.localizationPackWarning];
      report.degraded = true;
    }
    persistLocalization(s, report);
    console.log(`[agents] localization_director → ${vtl} (${report.translatedElements}/${report.elementCount} verified, coverage ${report.localizationCoverage}%)`);
  }
  return { storyboard: s.storyboard, localizedStrings: (report && report.localizedStrings) || null };
}

// BRAND STRING OVERRIDES — the film's fixed copy, re-pointed at the customer's brand.
//
// Every native composer ships a STRINGS table with `ctaUrl: "keyframe.ai"`, and each
// one renders it as the closing line under the CTA. So a film made FOR wisprflow.ai
// closed on KEYFRAME's own domain — the studio's watermark stamped where the client's
// identity belongs, on 14 packs at once.
//
// Composers already merge an override object over their STRINGS (`{...STRINGS,
// ...localized}`), which the Localization Director uses for translation. That is the
// single choke point, so brand overrides ride the same channel instead of 14 edits.
// Only overrides what we actually know: with no analysed site the pack keeps its
// default rather than inventing a domain.
function brandStringOverrides(job) {
  const raw = job?.intent?.websiteUrl;
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, "");
    if (!host || host.length > 40) return null;
    return { ctaUrl: host };
  } catch { return null; }
}

// The one object a composer receives to override its built-in STRINGS. Brand facts
// first, then the Localization Director's translations on top — a translated string
// must win over an untranslated brand default for the SAME key, and the brand's own
// domain is not a translatable string, so the two never actually collide.
function composerStrings(s) {
  const brand = brandStringOverrides(s.job);
  const loc = s.localizedStrings || null;
  if (!brand && !loc) return null;
  return { ...(brand || {}), ...(loc || {}) };
}

function persistLocalization(s, report) {
  try { db.setLocalization(s.job.id, report); } catch { /* fail-open: disclosure never blocks a render */ }
}

// Caption Director — resolves the caption / localization plan (translation,
// language font, text direction, per-scene resolved caption + VO text) from the
// approved script + the user's caption settings. Runs in the fan-out BEFORE the
// voice and composition nodes so all three consume one plan: the voice node
// speaks the localized line (mode 3), the composer burns the translated caption
// in the right font/direction, and the timeline exports translated SRT/VTT.
// Fail-open: a null plan degrades to the pre-feature English path.
async function captionDirectorAgent(s) {
  const { job, script, brief, tracker } = s;
  db.setProgress(job.id, "caption_director");
  const captionConfig = job.captions_config != null ? job.captions_config : (job.captions_enabled === 1);
  const languagePlan = languageDirector.getPlan(job);   // single source of truth (persisted at intake)
  const captionPlan = await resolveCaptionPlan({ captionConfig, script, brief, job, tracker, languagePlan })
    .catch((e) => { console.warn(`[agents] caption_director failed: ${e.message}`); return null; });
  if (captionPlan) {
    console.log(`[agents] caption_director → ${captionPlan.enabled ? "on" : "off"} subs=${captionPlan.language} voice=${captionPlan.voiceLanguage} mode=${captionPlan.mode}` +
      (captionPlan.mode !== "original" ? ` (subs ${captionPlan.translate.translatedCount}/${captionPlan.translate.totalCount}${captionPlan.translate.ok ? "" : " FELL BACK"})` : ""));
  }
  return { captionPlan };
}

// Voice Agent — per-scene fitted VO + script SFX + music, in parallel.
async function voiceAgent(s) {
  const { job, jobDir, tracker, script } = s;
  const audioDir = path.join(jobDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  const voice = pickVoice(job, script);
  // Delivery DIRECTION, not a demographic profile. Strip gender/age words (they
  // pick the voice, not the read) and turn pace into a spoken-energy phrase so
  // gpt-audio gets actionable acting notes instead of "30s female".
  const tone = String(script.voice?.style || "")
    .replace(/\b(male|female|man|woman|masculine|feminine|young|younger|older|aged?|teen|adult|nonbinary|he\/him|she\/her|\d+\s*s?)\b/gi, "")
    .replace(/\s{2,}/g, " ").replace(/^[\s,.;-]+|[\s,.;-]+$/g, "").trim() || "clear and confident";
  const pace = String(script.voice?.pace || "").toLowerCase();
  const paceEnergy = /slow|calm|measured|gentle/.test(pace) ? "unhurried and measured"
    : /fast|brisk|quick|punchy|energetic/.test(pace) ? "brisk and energetic"
    : "a relaxed, natural conversational rhythm";
  // When the voiceover language is non-English, tell the TTS to speak entirely in
  // it with a native accent — the lines are already translated, and the directive
  // makes gpt-audio commit to the target language's pronunciation.
  // Only emit the target-language directive when the VO text was ACTUALLY
  // translated. On a VO-translation failure voTextById reverts to the English
  // source (caption_director.js), so telling gpt-audio to "speak entirely in
  // Hindi" over English text makes it read English under a foreign directive —
  // an undetectable desync. Gating on voiceTranslate.ok drops the directive so
  // the model just reads the (English) fallback plainly; the note below discloses it.
  const voRequested   = !!(s.captionPlan && s.captionPlan.voiceLanguage && s.captionPlan.voiceLanguage !== "en");
  const voTranslateOk = !s.captionPlan || s.captionPlan.voiceTranslate?.ok !== false;
  const voLangName = (voRequested && voTranslateOk) ? s.captionPlan.voiceLanguageName : null;
  const langDirective = voLangName ? `Speak entirely in ${voLangName}, as a native speaker. ` : "";
  const instructions = `${langDirective}Speak ${tone}. Delivery: ${paceEnergy}. Vary intonation naturally, land emphasis on key words, and warm the final line.`;

  // The voiceover speaks the line in the chosen VOICEOVER language (which may
  // differ from the caption language). Guarded by the same source-voiceover check
  // so only scenes that HAD narration get synthesized.
  const voTextFor = (sc) => (s.captionPlan && s.captionPlan.voTextById[String(sc.id)]) || sc.voiceover;

  // THE VOICEOVER DECISION. The user's toggle acts at exactly ONE place — here, on
  // SYNTHESIS. The script keeps its narration text and the storyboard has already read it
  // (storyboardPromptFromScript feeds every VO line into the storyboard prompt), so the
  // PICTURE is byte-identical whether narration is on or off. That is the property that
  // makes this a mix control rather than a regeneration: the user can flip it back on from
  // the Script Room without redesigning the film.
  //
  // Side benefit worth naming: with VO off, synthesizeFitted never runs, so the film costs
  // ZERO TTS — the largest per-character spend in the audio stage.
  const voEnabled = job.voiceover_enabled !== 0;
  const voTask = voEnabled
    ? Promise.all(script.scenes.map((sc) =>
        (sc.voiceover && sc.voiceover.trim())
          ? synthesizeFitted({ text: voTextFor(sc), targetSec: sc.duration, voice, instructions, outputPath: path.join(audioDir, `vo-${sc.id}.mp3`), tracker })
              .then((r) => r ? { sceneId: sc.id, startSec: sc.start, durationSec: r.durationSec, sceneDurationSec: sc.duration, text: r.text, path: r.path, fallbackVoice: r.fallbackVoice || null } : null)
              .catch((e) => { console.warn(`[agents] vo ${sc.id} failed: ${e.message}`); return null; })
          : Promise.resolve(null)
      )).then((a) => a.filter(Boolean))
    : Promise.resolve([]);
  if (!voEnabled) console.log(`[agents] voice: narration DISABLED by the user — skipping synthesis (script text kept), music-led mix`);

  // SFX are planned, not skimmed off the top of the script (see services/sfx_plan.js).
  // Every cue must be supported by something the composition actually does at that
  // moment, survivors are spread across the runtime, and the budget scales with
  // length instead of being a flat 2 that always landed in the first four seconds.
  // Still QUIET — these are accents under the VO, not events in their own right.
  // The voice branch runs parallel to the asset chain, so assets are usually not
  // resolved yet here; planSfx then falls back to the script-derived reveal signals
  // (a number on screen, a second line of copy, a proof/feature purpose), which is
  // why those exist. When a re-entry does carry assets, they sharpen the test.
  const assetsByScene = new Map();
  for (const a of (s.assets || [])) {
    if (!a || a.sceneId == null) continue;
    if (!assetsByScene.has(a.sceneId)) assetsByScene.set(a.sceneId, []);
    assetsByScene.get(a.sceneId).push(a);
  }
  // NO-VO DENSITY. With narration off the film has to carry itself on picture and sound
  // design, so the cue budget rises (`sfxDensity: "rich"` on the pack's profile). The
  // SUPPORT requirement is unchanged and non-negotiable — a denser mix must still never
  // mean unmotivated sounds, which is the exact defect sfx_plan exists to prevent. More
  // cues are ALLOWED; only moments that genuinely happen on screen can fill them.
  const audioProfile = audioProfileSvc.profileFor(s.framePack);
  const sfxDensity = (!voEnabled && audioProfile.noVo.sfxDensity === "rich") ? 1.5 : 1;
  const sfxPlan = planSfx({ scenes: script.scenes, assetsByScene, durationSec: job.duration, densityScale: sfxDensity });
  if (sfxPlan.dropped.length) {
    console.log(`[agents] sfx_plan: ${sfxPlan.cues.length}/${sfxPlan.cues.length + sfxPlan.dropped.length} cue(s) kept (budget ${sfxPlan.budget}${sfxDensity > 1 ? ", no-VO density" : ""}) — dropped: ${sfxPlan.dropped.slice(0, 4).map((d) => `${d.name}@${d.sceneId} (${d.reason})`).join("; ")}`);
  }
  const sfxTask = Promise.all(sfxPlan.cues.map((x, i) => {
    // Fetch the INTENT, not the script's word. `intent` is the sound this moment should
    // make (logo-rise, counter-tick, cta-impact…), decided from what the scene actually
    // does; the raw word was how a counter ended up with a whoosh. See services/audio_cues.
    //
    // THE TEMPLATE PALETTE then decides what that intent SOUNDS LIKE on this pack —
    // terminal-departures' transition is a synthy sweep, paper-tales' is a paper slide.
    // A bias on the timbre only: it cannot add a cue, remove one, or move one, so the
    // support gate above still governs whether anything fires at all.
    const base = x.intent || x.name;
    const cue = audioProfileSvc.paletteCueFor(audioProfile, base);
    return getSfx({ name: cue, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
      // Carry the cue name + what justified it so the Audio Director can curate by intent.
      .then((p) => p ? { path: p, startSec: x.startSec, volume: 0.22, name: cue, requested: x.name, intent: base, support: x.support, sceneId: x.sceneId } : null).catch(() => null);
  })).then((a) => a.filter(Boolean));

  // TEMPLATE-DRIVEN MUSIC. The query used to be `script.music.mood + script.music.query` —
  // two fields the SCRIPT model invented from the film's SUBJECT, which never saw which
  // template the film wears. A Bauhaus poster and a cyberpunk terminal searched the same
  // phrase. musicCandidatesFor puts the PACK's own keywords first (rotated deterministically
  // per job, so two films on one template sound related but not identical), keeps the
  // subject query as a later candidate, and tilts toward the pack's driving end when
  // narration is off. A pack with no audio block returns exactly today's query.
  const musicSelection = {};
  const musicPlan = audioProfileSvc.musicCandidatesFor({
    framePack: s.framePack, jobId: job.id,
    narration: voEnabled ? "on" : "off",
    scriptMusic: script.music || null, profile: audioProfile,
  });
  if (musicPlan.candidates.length) {
    console.log(`[agents] music search (${musicPlan.source}${musicPlan.keywords.length ? `: ${musicPlan.keywords.join(" + ")}` : ""}) → ${musicPlan.candidates.slice(0, 3).map((c) => `"${c}"`).join(", ")}`);
  }
  const musicTask = musicPlan.candidates.length
    ? fetchMusic({
        candidates: musicPlan.candidates, outputPath: path.join(audioDir, "music.mp3"),
        tracker, durationSec: job.duration, style: audioProfile.style, selection: musicSelection,
      }).catch(() => null)
    : Promise.resolve(null);

  const [voClips, sfxClips, musicPath] = await Promise.all([voTask, sfxTask, musicTask]);

  // ANTI-OVERLAP: guarantee no two voiceover lines ever play at once. vo_fit already
  // speed-fits each clip inside its scene, but as a hard safety net each line starts
  // no earlier than the previous line's END (+ a short breath). A line that still
  // overran thus nudges the next one slightly later instead of talking over it —
  // intelligible speech beats frame-perfect sync. Captions (built from these clips)
  // and the mixer both read the corrected startSec, so they stay consistent.
  voClips.sort((a, b) => (Number(a.startSec) || 0) - (Number(b.startSec) || 0));
  let voCursor = 0;
  for (const c of voClips) {
    const st = Math.max(Number(c.startSec) || 0, voCursor);
    c.startSec = Math.round(st * 100) / 100;
    voCursor = st + (Number(c.durationSec) || 0) + 0.1;
  }
  console.log(`[agents] voice: ${voClips.length} vo clip(s), ${sfxClips.length} sfx, music=${!!musicPath}`);

  // Surface audio degradation on the job — a silent film must never ship
  // silently. (The Premiere screen shows these notes with the details.)
  //
  // TRAP #1, and it fires on EVERY narration-free film if missed. We deliberately KEEP the
  // script's voiceover text (the storyboard reads it), so `wantedVo` stays true with the
  // toggle off — and this note would then tell every user who chose a music-only film that
  // their film is broken. `voEnabled` is what separates "the user asked for no voice" from
  // "the voice failed to arrive", and those two states must never share a disclosure.
  const wantedVo = script.scenes.some((sc) => sc.voiceover && sc.voiceover.trim());
  const notes = [];
  if (voEnabled && wantedVo && voClips.length === 0) {
    notes.push("Voiceover unavailable — the TTS provider failed (budget/limits). The film shipped without narration; regenerate once the provider resets to add the voice back.");
  }
  if (!musicPath && musicPlan.candidates.length) {
    notes.push("Music unavailable — no source matched and the generated bed also failed; the film shipped without a music track.");
  }
  // A requested non-English voiceover whose translation failed spoke ENGLISH
  // (voTextById fell back to source). Disclose it — the user asked for localized
  // narration and must not silently receive English.
  if (voRequested && !voTranslateOk) {
    notes.push(`Voiceover translation to ${s.captionPlan.voiceLanguageName} failed — narration shipped in English. Regenerate to retry the translation.`);
  }
  if (notes.length) db.setAudioNotes(job.id, notes);

  // `narration` + `musicSelection` ride the state to the Audio Director and the audio
  // report: the director branches on the mode, and the report can only assert "the
  // template steered the music" if it knows which query actually won.
  return {
    voClips, sfxClips, musicPath,
    narration: voEnabled ? "on" : "off",
    audioProfile,
    musicSelection: { ...musicSelection, source: musicPlan.source, keywords: musicPlan.keywords, candidates: musicPlan.candidates },
  };
}

// Audio Director — decides the per-scene audio MIX (broadcast loudness targets,
// music energy curve, scene-aware ducking, curated SFX) that the timeline mixer
// executes. Runs after animation + voice so it sees the real scene plan and the
// measured VO clips. Fail-open: directAudio always returns a usable plan (LLM or
// a deterministic default), so this never blocks a render.
async function audioDirectorAgent(s) {
  const { job, tracker } = s;
  db.setProgress(job.id, "audio_director");
  const audioPlan = await directAudio({
    jobId: job.id,
    storyboard: s.storyboard,
    script: s.script,
    voClips: s.voClips || [],
    sfxClips: s.sfxClips || [],
    musicPath: s.musicPath || null,
    brief: s.brief,
    subject: s.brief?.subject || null,
    durationSec: job.duration,
    tracker,
    // The Creative Director's soundtrack verdict (creative_director node → this node).
    musicAdvice: s.audioAdvice?.music || null,
    sfxAdvice: s.audioAdvice?.sfx || null,
    // THE VOICEOVER DECISION, made in voiceAgent and read here BEFORE any other audio
    // decision — the brief's "Audio Director should first determine whether voiceover is
    // enabled". Taken from the state (not re-derived from voClips.length) so a TTS
    // failure on a narrated film is never mistaken for a music-led film the user chose.
    narration: s.narration || "on",
    framePack: s.framePack || null,
    audioProfile: s.audioProfile || null,
  }).catch((e) => { console.warn(`[agents] audio_director failed: ${e.message}`); return null; });

  // DETERMINISTIC AUDIO VALIDATION. The plan's own `score` is the model grading itself;
  // this checks the finished soundtrack against the actual scenes and cues — every effect
  // mapped, no duplicates, nothing firing without an on-screen action, voice protected.
  // Fail-open (THE LAW): a disclosure never touches the render.
  try {
    const { buildAudioReport } = require("../services/audio_report");
    const report = buildAudioReport({
      plan: audioPlan, sfxClips: s.sfxClips || [], scenes: (s.script && s.script.scenes) || [],
      musicPath: s.musicPath || null, musicMood: (s.script && s.script.music && s.script.music.mood) || "",
      voClips: s.voClips || [],
      // The four checks the flexible-audio feature adds: was the user's toggle respected,
      // did the TEMPLATE steer the music, is ducking correct FOR THIS MODE, and did the
      // no-VO mix actually open up. All need inputs the plan alone does not carry.
      narration: s.narration || "on",
      voiceoverRequested: job.voiceover_enabled !== 0,
      profile: s.audioProfile || null,
      musicSelection: s.musicSelection || null,
    });
    db.setAudioReport(job.id, report);
    console.log(`[audio] ${report.soundEffects} effect(s), ${report.sceneMatches} scene-matched, ${report.duplicateEffects} duplicate(s), ducking=${report.voiceoverDucking}/${report.sfxDucking}, `
      + `narration=${report.narration}${report.voiceoverRespected === false ? " MISMATCH" : ""}, music=${report.musicSource}, quality=${report.qualityScore}`
      + (report.issues.length ? ` — ${report.issues.join("; ")}` : ""));
  } catch (e) { console.warn(`[agents] audio report skipped: ${e.message}`); }

  return { audioPlan };
}

// Composition Agent (+ the Animation agent's work product: the timeline).
//
// Two jobs, deliberately split: composeVisual builds + renders the film (a dozen
// fallback paths, each returning a `visual`), and this wrapper then persists the brand
// skin the finished film ACTUALLY WORE. The split means the authoritative brand write
// fires in exactly ONE place no matter which compose path won — and, because repair laps
// re-enter through here, the LAST composition's skin is always the one on record.
// Pre-render Validation Gate (T2) — config.validationGate. Runs ONCE (first composition
// pass): (1) SELF-HEALS by dropping any asset whose file is missing on disk so the
// composer never emits a broken <img src>; (2) records a DIAGNOSTIC report via
// db.setValidationReport; (3) HARD-FAILS only the one narrow, genuinely-unrecoverable
// state — the user supplied their OWN material (uploads / captured website screenshots)
// but none survived collection AND no stock was fetched. Everything else is
// disclosure-only, so the fail-open house law still governs mere quality shortfalls.
function validateBeforeRender(s) {
  if (!config.validationGate?.enabled) return;
  const { job, jobDir } = s;
  const report = preflight({
    job,
    assets: Array.isArray(s.assets) ? s.assets : [],
    script: s.script,
    storyboard: s.storyboard,
    brandSkin: s.brandSkin,
    jobDir,
    acceptsVectors: require("../services/frame_manifest").packAcceptsVectors(s.framePack),
    hardFail: config.validationGate.hardFail !== false,
  });
  // Adopt the self-healed list so the composer never emits a broken <img src>.
  if (report.selfHealed) {
    s.assets = report.healedAssets;
    console.warn(`[agents] preflight: self-healed ${report.selfHealed} asset(s) with missing files`);
  }
  delete report.healedAssets; // not disclosure material — it's the whole asset wire

  console.log(`[preflight] ${report.summary}`);
  for (const w of report.warnings) console.warn(`[preflight] WARN ${w.id}: ${w.detail}`);
  for (const f of report.failures) console.error(`[preflight] FAIL ${f.id}: ${f.detail}`);

  try { db.setValidationReport(job.id, report); } catch { /* a disclosure never blocks a render by its own failure */ }
  if (report.blockedBy) {
    const f = report.failures[0];
    throw new Error(`pre-render validation failed (${f.id}): ${f.detail}. ${f.fix || ""}`.trim());
  }
}

async function compositionAgent(s) {
  if (!s.qa) validateBeforeRender(s); // first pass only — repair laps reuse the healed assets
  const result = await composeVisual(s);
  persistRenderAudit(s);
  persistWornBrand(s, result.visual);
  persistAssetCoverage(s, result.visual);
  persistBrandCoverage(s, result.visual);
  persistAssetUsageReport(s, result.visual);
  // Return the (possibly self-healed) asset list so repair laps + later nodes see the
  // broken-path drops rather than the pre-heal list.
  return { ...result, assets: s.assets };
}

// Website Asset Intelligence — the post-composition Asset Usage Report + Validation Gate.
// Best-effort, fail-open (THE LAW: a disclosure never touches the render). Reconciles what
// the harvester collected at intake against what survived to the composed film (the CD-
// scored wire assets). Only meaningful when the harvester ran; a job with no harvested
// manifest still records a report whose validation checks read false (honest disclosure).
function persistAssetUsageReport(s, visual) {
  try {
    if (!config.harvester?.enabled) return;
    const { buildAssetUsageReport } = require("../services/asset_usage_report");
    const report = buildAssetUsageReport({
      job: s.job,
      assets: s.assets || [],
      harvestReport: (db.getRaw(s.job.id) || {}).asset_harvest || null,
      brandReview: visual && visual.resolvedBrand || null,
    });
    if (report) db.setAssetUsageReport(s.job.id, report);
  } catch { /* fail-open: the usage-report disclosure is never worth a lost render */ }
}

// Brand-color coverage disclosure — best-effort, fail-open (THE LAW: never touches the
// render). Scores the composed index.html against the brand the film actually wore
// (visual.resolvedBrand). Only meaningful when a brand skin was applied; a null resolved
// brand (unbranded film / composer that ignores the skin) records nothing.
function persistBrandCoverage(s, visual) {
  try {
    const resolvedBrand = visual && visual.resolvedBrand;
    if (!resolvedBrand) return;
    let html = "";
    try { html = fs.readFileSync(path.join(s.jobDir, "index.html"), "utf8"); } catch { return; }
    const report = scoreBrandCoverage({ indexHtml: html, resolvedBrand });
    if (report) db.setBrandCoverage(s.job.id, report);
  } catch { /* fail-open: the brand-coverage disclosure is never worth a lost render */ }
}

// User-asset coverage disclosure — best-effort, fail-open (THE LAW: never touches
// the render). The scene-kit hands back an exact `assetCoverage` (with the repair
// lap result); every other composer just wrote an index.html, so we scan it for
// each upload's path. Only persists when the user actually uploaded material.
function persistAssetCoverage(s, visual) {
  try {
    const assets = s.assets || [];
    if (!assets.some((a) => a && a.source === "upload")) return;
    let coverage = visual && visual.assetCoverage;
    if (!coverage) {
      let html = "";
      try { html = fs.readFileSync(path.join(s.jobDir, "index.html"), "utf8"); } catch { /* no file */ }
      coverage = coverageFromHtml({ assets, indexHtml: html });
    }
    if (coverage) db.setAssetCoverage(s.job.id, coverage);
  } catch { /* fail-open: the coverage disclosure is never worth a lost render */ }
}

// The palette RECONCILED against the pack's own ground — the color the film paints, not
// the color the Art Director proposed. The Art Director wrote its pre-resolution pick
// earlier (art_director.persistBrandReview); this write runs strictly AFTER it (the
// composition node takes an in-edge from art_director, and repair never re-runs it), so
// in the single-threaded store the reconciled skin deterministically overwrites the pick
// — no lock, no race. A #146eb4 the user picked and a #bbd5ea the near-black stage lifted
// it to are different claims, and only the composer that fit it knows which one shipped.
//
// The film wore NO brand (the composer fell back to its stock palette — a conditional wearer
// like bauhaus's all-or-nothing triad, or any native pack whose reHue could not clear its
// ground for this hue). CLEAR any pre-composition proposal so the Brand panel never strands an
// unworn colour. This clobber-to-null is REQUIRED now that SKIN_AWARE_RENDERERS admits
// CONDITIONAL wearers (it once held only the always-wearing flagship, so leaving the record
// untouched was safe); the single downstream choke point makes the proposed-but-not-worn gap
// disappear for every pack. Best-effort + fail-open (THE LAW): a failed disclosure write never
// touches the render.
// POST-RENDER audit — reconcile the assets composition RECEIVED against what the
// composed HTML actually renders, and fold the verdict into the validation report.
//
// asset_render_check has computed this all along (including the per-scene spread that
// would have shown 3 of 7 scenes empty in the audited film) but only ever console.log'd
// it, so a text-only regression was invisible to anyone not reading server output. The
// preflight gate can only reason about INTENT; this is the only check that sees what
// was actually drawn, which makes it the one that closes "templates rendered correctly"
// and "no broken bindings". Fail-open (THE LAW): a disclosure never touches the render.
function persistRenderAudit(s) {
  try {
    let html = "";
    try { html = fs.readFileSync(path.join(s.jobDir, "index.html"), "utf8"); } catch { return; }
    const { auditAssetRender, isAssetRenderFailure } = require("../services/asset_render_check");
    const audit = auditAssetRender({ indexHtml: html, assets: s.assets || [], jobDir: s.jobDir });
    if (!audit) return;
    const emptyScenes = Math.max(0, (audit.sceneCount || 0) - (audit.scenesWithAsset || 0));
    if (isAssetRenderFailure(audit)) {
      console.error(`[preflight] POST-RENDER FAIL ${audit.renderStatus}: ${audit.assetsRendered}/${audit.assetsCollected} asset(s) reached the film`);
    } else if (emptyScenes > 0) {
      console.warn(`[preflight] POST-RENDER: ${emptyScenes} of ${audit.sceneCount} scene(s) render no asset`);
    }
    const prev = (db.getRaw(s.job.id) || {}).validation_report || null;
    if (!prev) return;
    const merged = {
      ...prev,
      render: {
        status: audit.renderStatus,
        assetsRendered: audit.assetsRendered,
        assetsCollected: audit.assetsCollected,
        scenesWithAsset: audit.scenesWithAsset,
        sceneCount: audit.sceneCount,
        emptyScenes,
        logoRendered: audit.logoRendered,
        invalidPaths: audit.invalidPaths,
      },
    };
    if (isAssetRenderFailure(audit)) {
      merged.failures = [...(prev.failures || []), {
        id: "templateRenderedAssets",
        detail: `the composed film renders ${audit.assetsRendered} of ${audit.assetsCollected} collected asset(s) (${audit.renderStatus})`,
        fix: "The template discarded the assets it was given — check the pack's asset gate against the asset types collected.",
      }];
    } else if (emptyScenes > 0) {
      merged.warnings = [...(prev.warnings || []), {
        id: "scenesRenderNoAsset",
        detail: `${emptyScenes} of ${audit.sceneCount} scene(s) show no asset and render template-only panels`,
        fix: "Assign more visuals per scene, or choose a template whose empty state is a designed graphic rather than a blank plate.",
      }];
    }
    db.setValidationReport(s.job.id, merged);
  } catch { /* fail-open: the render audit is never worth a lost film */ }
}

function persistWornBrand(s, visual) {
  const resolved = visual && visual.resolvedBrand;
  if (!resolved) { try { db.setBrandReview(s.job.id, null); } catch { /* disclosure never blocks a render */ } return; }
  const input = s.brandSkin || {};
  try {
    db.setBrandReview(s.job.id, {
      accents: resolved.accents,
      emphasis: resolved.emphasis,
      adjusted: resolved.adjusted,
      dropped: resolved.dropped,
      tier: resolved.tier,
      applied: resolved.applied,
      // reason/source/provenance are v1 fields the Brand panel reads; they live on the
      // INPUT skin, never on the resolved PackSkin — carry them across so the disclosure
      // keeps its "SOURCE · LLM / PALETTE · LIFTED FROM YOUR SITE / …" lines.
      reason: input.reason,
      source: input.source,
      provenance: input.provenance,
    });
  } catch { /* fail-open: the brand disclosure is never worth a lost render */ }
}

async function composeVisual(s) {
  const { job, jobDir, tracker } = s;
  db.setProgress(job.id, "composing");
  const dims = { width: job.width, height: job.height, fps: job.fps };

  // On-screen caption cues + language font/direction come from the Caption
  // Director (translated text, estimated timing, language-aware duration). Fall
  // back to the pre-feature English estimate when no plan is present.
  const wc = (t) => (String(t || "").match(/\S+/g) || []).length;
  const captionCues = s.captionPlan
    ? s.captionPlan.bakedCues
    : (job.captions_enabled === 0 ? [] : buildCues(
        s.script.scenes.filter((x) => x.voiceover && x.voiceover.trim()).map((x) => ({
          sceneId: x.id, startSec: x.start,
          durationSec: Math.min(x.duration, wc(x.voiceover) / 2.6 + 0.4),
          sceneDurationSec: x.duration, text: x.voiceover,
        }))
      ).map((c) => ({ start: Math.round(c.start * 10) / 10, end: Math.round(c.end * 10) / 10, text: c.text })));
  const captionStyle = s.captionPlan ? s.captionPlan.captionStyle : null;

  // Carry QA repair feedback into the composer when looping.
  const storyboard = s.qa && s.qa.issues?.length
    ? { ...s.storyboard, __qaIssuesToFix: s.qa.issues.map((i) => `at ${i.atSec}s [${i.severity}]: ${i.issue} — FIX: ${i.fix}`) }
    : s.storyboard;

  const budget = (Number(config.server.stageBudgetSec) || 480) * 1000;
  // Composer dispatch. The user's per-video finish choice wins:
  //   compose_mode "premium"  → the LLM composition agent (remix)
  //   compose_mode "standard" → the deterministic scene-kit
  //   unset                   → the global USE_LLM_COMPOSER default
  // Either way the kit stays available as the fallback below.
  const useComposer = job.compose_mode === "premium"
    ? true
    : job.compose_mode === "standard"
      ? false
      : config.llm.useComposer !== false;
  if (job.compose_mode) console.log(`[agents] job ${job.id} finish=${job.compose_mode} → ${useComposer ? "LLM composer" : "scene-kit"}`);
  try {
    // Asset-rich videos override an opt-in render3d: the 3D composer only textures
    // ONE screenshot, so a video with several real screenshots/photos is showcased
    // far better by the 2D composer (which weaves 8-10). Text-forward 3D stays 3D.
    // A dedicated 3D pack (flagship/brightlife) is ALREADY a Three.js composer that
    // places the real website screenshots on its glass plates — never divert it to the
    // generic website→3D composer (which textures only ONE shot and would drop the rest).
    // Only a NON-dedicated pack honors the render3d website→3D path; asset-rich prefers 2D.
    const dedicatedThree = (() => {
      try { const m = require("../services/frame_manifest").getManifest(s.framePack); return /^three-(flagship|brightlife)$/.test((m && m.renderer) || ""); }
      catch { return false; }
    })();
    const use3d = job.render3d && !dedicatedThree && !isAssetRich(s.assets || []);
    if (job.render3d && !use3d) {
      console.log(`[agents] render3d requested → ${dedicatedThree ? "routing to the pack's own 3D composer" : "using the 2D composer (asset-rich; 3D would drop all but one)"} so the screenshots are shown.`);
    }
    if (use3d) {
      // Website→3D: the real website screenshots in s.assets texture the reveal
      // plate. Deterministic + self-contained; on failure it falls to the
      // scene-kit fallback in the catch below.
      const visual = await withBudget(
        (signal) => composeWithThree({
          storyboard, dims, jobDir, framePack: s.framePack, captionCues,
          assets: s.assets || [], jobId: job.id, durationSec: job.duration,
          label: "graph-three", abortSignal: signal, tracker,
          brandSkin: s.brandSkin || null, captionStyle,
        }),
        budget, "Three.js composition"
      );
      return { visual, usedFallback: false, finalAttempt: "three", repairable: false };
    }
    const visual = await withBudget(
      (signal) => attemptLlmComposition({
        storyboard, dims, jobDir, assets: s.assets || [], tracker,
        jobId: job.id, durationSec: job.duration,
        label: s.qa ? "graph-repair" : "graph-main", abortSignal: signal,
        framePack: s.framePack, captionCues, remix: useComposer,
        brandSkin: s.brandSkin || null, layoutPlan: s.layoutPlan || null, motionPlan: s.motionPlan || null, captionStyle, localized: composerStrings(s),
      }),
      budget, "composition agent"
    );
    // repairable only when the LLM composer (remix) actually ran — it is the only
    // path that reads __qaIssuesToFix and can produce a DIFFERENT render on a repair
    // lap. The deterministic scene-kit (useComposer=false) renders identically, so
    // QA/repair is skipped for it downstream (qaAgentNode).
    return { visual, usedFallback: false, finalAttempt: s.qa ? "qa-repair" : "main", repairable: useComposer };
  } catch (e) {
    console.warn(`[agents] composition failed (${e.message.slice(0, 180)})`);
    // Budget-class failure (provider out of credits / daily-capped): a QA
    // repair lap would hit the exact same wall, so flag it and stop looping.
    const composerBudgetDead = /\b402\b|can only afford|credits|budget exhausted|daily limit/i.test(String(e.message));
    if (composerBudgetDead) console.warn(`[agents] composer budget exhausted — QA repair laps disabled for this job`);
    // On a QA-triggered repair lap, a failed re-compose must NOT discard the
    // prior render that already passed lint and was QA-reviewed by shipping the
    // bland deterministic template. A real (if imperfect) composition beats a
    // fallback slide — keep the previous good render.
    if (s.qa && s.visual && !s.usedFallback) {
      console.warn(`[agents] repair re-compose failed — keeping prior lint-passing render (not falling back to template)`);
      return { visual: s.visual, usedFallback: false, finalAttempt: s.finalAttempt || "main", rendered: true, composerBudgetDead, repairable: useComposer };
    }
    try {
      if (fs.existsSync(path.join(jobDir, "index.html"))) {
        fs.copyFileSync(path.join(jobDir, "index.html"), path.join(jobDir, "index.llm-attempt.html"));
      }
    } catch { /* best effort */ }
    // The LLM composer failed its gates. Before the bland template, try the
    // deterministic ASSET-RICH scene-kit — a real, lint-clean, multi-asset comp
    // (screenshot hero + montage + scrim B-roll) beats a fallback slide. Only
    // worth a separate attempt when the composer (remix) was the primary path.
    if (useComposer) {
      try {
        console.warn(`[agents] scene-kit fallback (deterministic, asset-rich)`);
        // Premium jobs get the HYBRID: bounded LLM set-dressing over the kit
        // (variants + emphasis + sanitized decor) — composer-flavoured art
        // direction without composer failure modes. Skipped when the failure
        // was budget-class (the dressing call would die on the same wall).
        const visual = await attemptLlmComposition({
          storyboard, dims, jobDir, assets: s.assets || [], tracker,
          jobId: job.id, durationSec: job.duration, label: "scene-kit-fallback",
          framePack: s.framePack, captionCues, remix: false,
          dress: job.compose_mode === "premium" && !composerBudgetDead,
          subject: s.brief?.subject || null,
          brandSkin: s.brandSkin || null, layoutPlan: s.layoutPlan || null, motionPlan: s.motionPlan || null, captionStyle, localized: composerStrings(s),
        });
        return { visual, usedFallback: false, finalAttempt: "scene-kit", rendered: true, composerBudgetDead, repairable: false };
      } catch (e2) {
        console.warn(`[agents] scene-kit fallback failed (${String(e2.message).slice(0, 120)}) — bland template`);
      }
    }
    console.warn(`[agents] deterministic fallback`);
    const fb = buildFallback({
      prompt: s.brief?.improvedPrompt || job.prompt, duration: job.duration,
      orientation: job.orientation, width: dims.width, height: dims.height, fps: dims.fps,
      storyboard: s.storyboard,
      packTokens: s.framePack ? frameRegistry.getPackTokens(s.framePack) : null,
      assets: s.assets || [],
      captionCues,
    });
    // Run the fallback through the same safe normalizer the LLM path uses, so a
    // pack font token / track overlap never ships an un-checked fallback.
    const fbNorm = normalizeComposition(fb.indexHtml);
    fs.writeFileSync(path.join(jobDir, "index.html"), injectCaptionStyle(fbNorm.html, captionStyle), "utf8");
    fs.writeFileSync(path.join(jobDir, "meta.json"), fb.metaJson, "utf8");
    tracker.addExternal("hyperframes_render");
    const visual = await render({ jobId: job.id, jobDir, durationSec: job.duration });
    return { visual, usedFallback: true, finalAttempt: "fallback", rendered: true, composerBudgetDead, repairable: false };
  }
}

// MOTION PLANNER — decides how each scene MOVES, before anything is composed.
//
// This node used to be an "animation" audit that ran AFTER composition and grepped the
// finished HTML for a tween count. It planned nothing, because motion was decided per
// FILM two levels down: one text-entrance mode and one camera cut for the entire video,
// so every scene arrived identically. The planner (services/motion_planner.js) chooses a
// distinct entrance + camera per scene from its narrative role and duration, guarantees
// adjacent scenes differ, and stays inside the vocabulary the composer implements.
//
// Deterministic and free (no LLM). Runs after the storyboard is fully built and the
// layout archetypes are typed; joins composition alongside the brand skin. Fail-open: a
// null plan makes the scene-kit fall back to the pack's film-level motion exactly as before.
// A pack with a dedicated renderer draws its own choreography: om_stage rotates its camera
// order and cut kinds per job, prisma runs its own entrance primitives, and none of them read
// `motionPlan` — it is threaded only into the scene-kit (services/pipeline.attemptLlmComposition).
// So for those packs the planner was computing a plan, persisting it, and being ignored, while
// verifyMotion reported `honored: null` for every scene — which reads as "could not measure"
// rather than "does not apply". Two different failures look identical in that record, and the
// one that was actually happening was neither.
function packOwnsChoreography(pack) {
  return !!rendererOf(pack);   // "" => no dedicated renderer => the scene-kit path
}

async function motionPlannerAgent(s) {
  // Record the REASON rather than a plan nobody will read. The audit then says the template
  // owns its motion, which is true and checkable, instead of leaving a plan-vs-actual
  // comparison permanently unanswerable.
  if (packOwnsChoreography(s.framePack)) {
    const note = { ownChoreography: true, framePack: s.framePack, reason: "the template draws its own per-scene entrances, camera and cuts; a film-level motion plan does not apply" };
    try { db.setMotionPlan(s.job.id, note); } catch { /* disclosure never blocks a render */ }
    console.log(`[agents] motion_planner → skipped: "${s.framePack}" owns its choreography`);
    return { motionPlan: null };
  }
  try {
    const plan = planMotion({
      storyboard: s.storyboard,
      framePack: s.framePack,
      layoutPlan: s.layoutPlan,
      seedKey: s.job.id,          // same per-job salt the kit uses for layout variety
    });
    if (plan) {
      try { db.setMotionPlan(s.job.id, plan); } catch { /* disclosure never blocks a render */ }
      console.log(`[agents] motion_planner → ${plan.variety.distinctEnters} entrance(s) / ${plan.variety.distinctCameras} camera(s) across ${plan.variety.sceneCount} scene(s)`
        + (plan.vocabulary.signatureCut ? `, pack cut "${plan.vocabulary.signatureCut}"` : "")
        + (plan.variety.adjacentRepeats ? ` — ${plan.variety.adjacentRepeats} adjacent repeat(s)` : ""));
    }
    return { motionPlan: plan };
  } catch (e) {
    console.warn(`[agents] motion_planner failed (${String(e.message).slice(0, 120)}) — pack motion`);
    return { motionPlan: null };
  }
}

// Animation Agent — deterministic timeline audit of the composed HTML:
// every scene window must be covered by timeline activity, and the known
// footguns must be absent.
//
// Its findings used to go NOWHERE. `animationReport` was returned into graph state,
// declared in the Annotation, console.warn'd — and never read by anything: not
// persisted, not surfaced in the UI, not shown to QA. An agent that detects
// "likely under-animated" and then whispers it to a log file is not a check, it is
// a comment. The report now lands on the job (the Premiere panel reads the same
// validation record as every other disclosure) and its warnings are handed to the
// QA reviewer, which is the one agent positioned to confirm them against pixels.
// MOTION VERIFICATION — what the composition actually DID, against what was planned.
//
// The old version of this node counted `tl.*(` calls across the whole document and
// warned when the total fell under scenes×2. That heuristic could not name a scene, and
// it misfires on canvas-driven packs (kinetic-universe, product-showcase, the three-*
// family) which animate through an hf-seek listener and legitimately emit few timeline
// calls — so it handed the QA reviewer false "under-animated" concerns to chase.
//
// With a plan to compare against, the check becomes specific: which scenes are static,
// and which did not use the entrance they were planned. Composers that own their
// choreography (the native packs) are detected and graded on the generic checks only,
// rather than reported as drift.
async function animationAgent(s) {
  if (s.usedFallback) {
    const report = { tweenCount: 0, sceneCount: 0, warnings: ["fallback composition"] };
    persistAnimationReport(s, report);
    return { animationReport: report };
  }
  let html = "";
  try { html = fs.readFileSync(path.join(s.jobDir, "index.html"), "utf8"); } catch { /* no file */ }

  const v = verifyMotion({ plan: s.motionPlan, indexHtml: html, storyboard: s.storyboard });
  const sceneCount = (s.storyboard?.scenes || []).length || 1;
  // Only meaningful for a DOM-timeline composer; a canvas pack's low tween count says
  // nothing about whether the picture moves.
  if (v.planAware && v.totalTweens < sceneCount * 2) {
    v.warnings.push(`only ${v.totalTweens} timeline calls for ${sceneCount} scenes — likely under-animated`);
  }
  if (v.warnings.length) console.warn(`[agents] motion audit: ${v.warnings.join(" | ")}`);
  else if (v.checkedCount) console.log(`[agents] motion audit: ${v.honoredCount}/${v.checkedCount} scene(s) used their planned entrance, ${v.totalTweens} tween(s)`);

  // A pack that owns its choreography was never given a plan (motionPlannerAgent skips it),
  // so plan-vs-actual is not a measurement that failed — it is one that does not apply. Saying
  // so explicitly keeps "the composer drifted from its plan" and "there was no plan" from
  // sharing the same null.
  const ownsChoreography = packOwnsChoreography(s.framePack);
  const report = {
    tweenCount: v.totalTweens,
    sceneCount,
    tweensPerScene: v.tweensPerScene,
    // Plan-vs-actual, the part a tween count could never express.
    planned: ownsChoreography ? false : v.planned,
    planHonored: v.honored,
    honoredCount: v.honoredCount,
    checkedCount: v.checkedCount,
    ownChoreography: ownsChoreography || !v.planAware,   // a dedicated composer owns its motion
    planApplies: !ownsChoreography,
    ...(ownsChoreography ? { note: `"${s.framePack}" draws its own entrances, camera and cuts — no film-level motion plan applies` } : {}),
    staticScenes: v.staticScenes,
    driftedScenes: v.driftedScenes,
    scenes: v.scenes,
    warnings: v.warnings,
  };
  persistAnimationReport(s, report);
  return { animationReport: report };
}

// Fold the timeline audit into the job's validation record — the single place the
// UI already reads for "what is wrong with this film". Fail-open (THE LAW): a
// disclosure write never touches the render.
function persistAnimationReport(s, report) {
  // The motion audit lands on its own key first: BOTH runners produce it, but only the
  // graph writes a validation record, so folding it exclusively into validation_report
  // (as this did) meant the legacy path planned motion and then verified it into a void.
  try { db.setMotionAudit(s.job.id, report); } catch { /* disclosure never blocks a render */ }
  try {
    const prev = (db.getRaw(s.job.id) || {}).validation_report || null;
    if (!prev) return;
    const merged = { ...prev, animation: report };
    if (report.warnings.length) {
      merged.warnings = [...(prev.warnings || []), ...report.warnings.map((w) => ({
        id: "animation",
        detail: w,
        fix: "Check the composer's timeline: every scene window needs its own tweens, and hidden states must not be inline transforms.",
      }))];
    }
    db.setValidationReport(s.job.id, merged);
  } catch { /* never worth a lost render */ }
}

// Timeline Agent — render (if not already), captions/SRT, audio mix.
async function timelineAgent(s) {
  const { job, jobDir, tracker } = s;
  let visual = s.visual;
  if (!s.rendered && !s.usedFallback) {
    // attemptLlmComposition already rendered; only the fallback path marks
    // rendered itself. visual is set either way.
  }
  db.setProgress(job.id, "audio");

  // Subtitle export — MEASURED timing from the VO clips, but the caption TEXT is
  // the resolved (possibly translated) per-scene line (in "translated" mode the
  // VO is English but the subtitle is the target language). SRT + VTT, gated by
  // the user's export toggles; then finalize + persist the quality report.
  const plan = s.captionPlan || null;
  const captionClips = (s.voClips || []).map((c) => ({
    ...c, text: (plan && plan.captionTextById[String(c.sceneId)]) || c.text,
  }));
  let cues = buildCues(captionClips);

  // TRAP #2 — CAPTIONS MUST NOT VANISH WITH THE VOICE. Subtitle timing is MEASURED from
  // the synthesized VO clips, so with narration off there are no clips, no cues, and the
  // film ships with no burned-in captions, no .srt and no .vtt. That is precisely
  // backwards: a silent-autoplay social video is where subtitles matter MOST, and it is
  // the film the toggle exists to make.
  //
  // The fallback is already computed. The Caption Director builds `bakedCues` from
  // estimated (language-aware) timing for the burn-in, which composeVisual has been using
  // all along — so the burned-in captions were never at risk, only the sidecar exports.
  // Reuse them, and DISCLOSE the downgrade: estimated timing is honest, silent timing is not.
  let cueTiming = "measured";
  if (!cues.length && plan && Array.isArray(plan.bakedCues) && plan.bakedCues.length) {
    cues = plan.bakedCues.map((c) => ({ start: c.start, end: c.end, text: c.text }));
    cueTiming = "estimated";
    console.log(`[agents] captions: no measured VO clips (narration ${s.narration || "on"}) — exporting ${cues.length} cue(s) from the Caption Director's estimated timing`);
  }
  if (cues.length) {
    try {
      const wantSrt = !plan || plan.exportSRT;
      const wantVtt = !plan || plan.exportVTT;
      let srtUrl, vttUrl;
      if (wantSrt) { writeSrt(cues, path.join(config.paths.videosDir, `${job.id}.srt`)); srtUrl = `/videos/${job.id}.srt`; }
      if (wantVtt) { writeVtt(cues, path.join(config.paths.videosDir, `${job.id}.vtt`)); vttUrl = `/videos/${job.id}.vtt`; }
      const quality = plan
        ? finalizeQuality(plan, {
            voScenes: (s.script?.scenes || []).filter((x) => x.voiceover && x.voiceover.trim()),
            measuredCues: cues, voClips: s.voClips || [],
          })
        : undefined;
      db.setCaptions(job.id, {
        cues, srtUrl, vttUrl,
        language: plan ? plan.language : undefined,
        mode: plan ? plan.mode : undefined,
        // A user reading "sync 100%" on estimated timing would be reading a number nobody
        // measured. Say which it is, right next to the score it qualifies.
        timing: cueTiming,
        quality: quality ? { ...quality, timingSource: cueTiming } : quality,
      });
      if (quality) console.log(`[agents] caption quality — lang=${quality.languageCode} sync=${quality.syncAccuracy} read=${quality.readabilityScore} cov=${quality.subtitleCoverage} font=${quality.fontCompatibility} xlate=${quality.translationQuality}`);
    } catch (e) { console.warn(`[agents] subtitle export failed: ${e.message}`); }
  }

  // ---- LANGUAGE QA (Director): consolidated pre-render disclosure — font embedded, English
  // leakage in on-screen DOM text, coverage, consistency — scored against the composed HTML.
  // Fail-open (THE LAW): a disclosure write never touches the render.
  try {
    const plan = languageDirector.getPlan(job);
    if (plan && plan.videoTextLanguage && plan.videoTextLanguage !== captionLang.SOURCE_LANG) {
      let html = ""; try { html = fs.readFileSync(path.join(jobDir, "index.html"), "utf8"); } catch { /* no file */ }
      const raw = db.getRaw(job.id) || {};
      const report = languageDirector.runLanguageQa({ plan, indexHtml: html, localization: raw.localization, captionQuality: raw.captionQuality });
      if (report) {
        db.setLanguageQa(job.id, report);
        console.log(`[agents] language_qa → font=${report.fontLoaded ? "ok" : "MISSING"} leakage=${report.leakage.count}word(s)/${report.leakage.score}%${report.degraded ? " DEGRADED" : ""}`);
      }
    }
  } catch (e) { console.warn(`[agents] language_qa skipped: ${e.message}`); }

  await mixAudioIntoVideo({
    visualPath: visual.videoPath,
    durationSec: job.duration,
    audio: {
      ttsPath: null,
      musicPath: s.musicPath || null,
      sfx: [
        // kind:"vo" lets the mixer duck the background music under speech.
        ...(s.voClips || []).map((c) => ({ path: c.path, startSec: c.startSec, volume: 1.0, kind: "vo" })),
        ...(s.sfxClips || []),
      ],
      musicVolume: config.audio?.defaultMusicVolume ?? 0.15,
      // Audio Director's per-scene mastering plan (loudness, ducking, SFX
      // curation). Persists across repair laps; null -> basic mix.
      audioPlan: s.audioPlan || null,
    },
  }).catch((e) => console.warn(`[agents] mix failed: ${e.message}`));

  return { visual };
}

// Repair lap — re-runs composition → animation audit → timeline as one
// node so the QA loop never re-enters the first lap's parallel joins.
async function repairAgent(s) {
  const comp = await compositionAgent(s);
  const m1 = { ...s, ...comp };
  const anim = await animationAgent(m1);
  const tl = await timelineAgent({ ...m1, ...anim });
  return { ...comp, ...anim, ...tl };
}

// QA Agent node — verdict, then loop control.
//
// INSPECTION AND REPAIRABILITY ARE SEPARATE QUESTIONS. This node used to conflate
// them: `repairable === false` skipped the review entirely, and since `repairable`
// is just `config.llm.useComposer` (default FALSE), QA ran on 7 of 98 finished
// projects. The one agent built to catch "empty scenes, offscreen content,
// unreadable text" — its own words — was off for 93% of renders, including every
// video in the quality audit that shipped exactly those defects.
//
// The old reasoning was half right: a deterministic composer re-renders
// byte-identically, so a repair lap on it IS pointless. But that is an argument
// against LOOPING, not against LOOKING. The verdict is worth having on its own —
// it is the only check performed on the finished MP4 rather than on the HTML that
// produced it, and it is what tells the user their film has a blank scene.
//
// So: review almost always, and let the conditional edge decide whether a repair
// lap can actually change anything (it consults `repairable`).
async function qaAgentNode(s) {
  // A fallback render has no composition to critique and no path to improve it;
  // reviewing it spends a vision call to confirm the template is a template.
  const repairable = s.repairable !== false;
  const skip =
    config.qa?.enabled === false ? "qa disabled"
      : s.usedFallback ? "fallback render"
        : !s.visual?.videoPath ? "no rendered video"
          // The operator can dial inspection back to repairable renders only — a review
          // costs ~27k vision tokens, roughly half a short film's total spend.
          : (!repairable && config.qa?.inspectNonRepairable === false) ? "non-repairable render (inspection disabled)"
            : null;
  if (skip) return { qa: { pass: true, issues: [], skipped: true, reason: skip } };
  db.setProgress(s.job.id, "qa");
  const verdict = await reviewRender({
    videoPath: s.visual.videoPath,
    scenes: s.script.scenes,
    duration: s.job.duration,
    framePack: s.framePack,
    workDir: path.join(s.jobDir, "qa"),
    tracker: s.tracker,
    // The timeline audit can only read HTML; it hands its open questions to the one
    // reviewer that can settle them against actual pixels.
    animationWarnings: (s.animationReport && s.animationReport.warnings) || [],
    // Which pictures recur BY DESIGN — so a deliberate second appearance is not reported as
    // repetition, and an under-varied one IS. See qa_agent.reusePrompt.
    reusePlan: s.assetReuse || null,
  }).catch((e) => {
    console.warn(`[agents] qa failed (${e.message.slice(0, 120)}); passing by default`);
    return { pass: true, issues: [], error: e.message };
  });
  // Record whether anything COULD be done about a failure, so a verdict on a
  // deterministic pack reads as "inspected, not fixable here" rather than looking
  // like the repair loop silently declined to run.
  verdict.repairable = s.repairable !== false;
  if (!verdict.pass && !verdict.repairable) {
    console.warn(`[agents] QA found ${verdict.issues?.length || 0} issue(s) on a deterministic render — reported, not repairable (a re-compose would be byte-identical)`);
  }
  return { qa: verdict, qaAttempts: (s.qaAttempts || 0) + 1 };
}

// ---------------------------------------------------------------- graph
let compiledGraph = null;

async function buildGraph() {
  if (compiledGraph) return compiledGraph;
  const { StateGraph, Annotation, START, END } = await import("@langchain/langgraph");

  const S = Annotation.Root({
    job: Annotation(), jobDir: Annotation(), tracker: Annotation(),
    brief: Annotation(), script: Annotation(),
    framePack: Annotation(), storyboard: Annotation(),
    brandSkin: Annotation(), layoutPlan: Annotation(), motionPlan: Annotation(),
    captionPlan: Annotation(), localizationPackWarning: Annotation(), orientationPackWarning: Annotation(), localizedStrings: Annotation(),
    assetPlan: Annotation(), assets: Annotation(), audioAdvice: Annotation(), assetReuse: Annotation(),
    voClips: Annotation(), sfxClips: Annotation(), musicPath: Annotation(), audioPlan: Annotation(),
    narration: Annotation(), audioProfile: Annotation(), musicSelection: Annotation(),
    visual: Annotation(), usedFallback: Annotation(), finalAttempt: Annotation(), rendered: Annotation(),
    animationReport: Annotation(), qa: Annotation(), qaAttempts: Annotation(),
    composerBudgetDead: Annotation(), repairable: Annotation(),
  });

  // Node names must not collide with state channel names (LangGraph rule),
  // hence the _agent suffixes on storyboard/qa.
  const g = new StateGraph(S)
    .addNode("frame_selector", frameSelectorAgent)
    .addNode("art_director", artDirectorAgent)
    .addNode("storyboard_agent", storyboardAgent)
    .addNode("scene_planner", scenePlannerAgent)
    .addNode("asset_planner", assetPlannerAgent)
    .addNode("asset_search", assetSearchAgent)
    .addNode("creative_director", creativeDirectorAgent)
    .addNode("visual_layout_director", visualLayoutDirectorAgent)
    .addNode("asset_reuse", assetReuseAgent)
    .addNode("caption_director", captionDirectorAgent)
    .addNode("localization_director", localizationDirectorAgent)
    .addNode("motion_planner", motionPlannerAgent)
    .addNode("voice_agent", voiceAgent)
    .addNode("audio_director", audioDirectorAgent)
    .addNode("composition", compositionAgent)
    .addNode("animation", animationAgent)
    .addNode("timeline", timelineAgent)
    .addNode("qa_agent", qaAgentNode)
    .addNode("repair", repairAgent);

  g.addEdge(START, "frame_selector");
  // Fan-out: four branches run in parallel. The Art Director only needs the brief
  // + the chosen pack, so it runs alongside the storyboard/asset/voice chain and
  // its brand skin joins at composition (near-zero added latency).
  g.addEdge("frame_selector", "storyboard_agent");
  g.addEdge("frame_selector", "asset_planner");
  g.addEdge("frame_selector", "caption_director");
  g.addEdge("frame_selector", "art_director");
  // The Caption Director resolves the localization plan (translation/font); the
  // voice node then speaks the resolved line (target language in "localized"
  // mode), so voice waits on it. Cheap (one batched translate call), and it also
  // feeds the composer + timeline, which is why composition joins on it below.
  g.addEdge("caption_director", "voice_agent");
  g.addEdge("storyboard_agent", "scene_planner");
  g.addEdge("asset_planner", "asset_search");
  // Join: the Creative Director needs the scene plan AND the fetched assets. It
  // curates/scores/assigns them; the Visual Layout Director then reuses those scores
  // to decide presentation (count/size/crop) + type each scene's base archetype.
  g.addEdge(["scene_planner", "asset_search"], "creative_director");
  g.addEdge("creative_director", "visual_layout_director");
  // The Asset Reuse Optimizer closes the coverage gap the layout director cannot: it needs
  // the FINAL placements (so it knows which scenes are still empty), and everything
  // downstream must see the clones it adds, so it sits directly between the two.
  g.addEdge("visual_layout_director", "asset_reuse");
  // The Localization Director translates the storyboard's ON-SCREEN text into the
  // video-text language. It needs the fully-built storyboard (via visual_layout_director →
  // asset_reuse, both downstream of scene_planner) AND the resolved videoTextLanguage (from
  // caption_director), so it joins on both; composition then waits on it + the brand skin.
  g.addEdge(["asset_reuse", "caption_director"], "localization_director");
  // Join: composition waits for the localized storyboard (archetypes + sizing/crop +
  // re-leveled assets + translated on-screen text) AND the brand skin (accent-only
  // palette). The caption plan's font/direction rides through localization_director.
  // The Motion Planner needs the finished storyboard (roles + timing) and the layout
  // archetypes, both settled by localization_director; it joins composition alongside the
  // brand skin. Deterministic, so it adds no measurable latency.
  g.addEdge("localization_director", "motion_planner");
  g.addEdge(["motion_planner", "art_director"], "composition");
  g.addEdge("composition", "animation");
  // Join: the Audio Director needs the render (scene/animation plan) AND the
  // voice branch (measured VO + fetched SFX/music). It decides the mix; the
  // timeline then renders captions + executes that mastering plan.
  g.addEdge(["animation", "voice_agent"], "audio_director");
  g.addEdge("audio_director", "timeline");
  g.addEdge("timeline", "qa_agent");
  g.addConditionalEdges("qa_agent", (s) => {
    const repairsLeft = (s.qaAttempts || 0) <= (Number(config.qa?.maxRepairs) || 1);
    // `repairable` now lives HERE rather than in the QA node. Only the LLM composer
    // reads __qaIssuesToFix and can produce a different render; a deterministic
    // composer would re-emit the identical bytes, so looping on it burns a full
    // Chromium render to change nothing. The verdict is still recorded either way —
    // that separation is the point of the decoupling.
    const canRepair = s.repairable !== false;
    if (!s.qa?.pass && repairsLeft && canRepair && !s.usedFallback && !s.composerBudgetDead) {
      console.log(`[agents] QA failed — repair lap ${s.qaAttempts}`);
      return "repair";
    }
    if (!s.qa?.pass && !canRepair) {
      console.log(`[agents] QA failed on a deterministic render — issues reported, no repair lap (a re-compose is byte-identical)`);
    }
    if (!s.qa?.pass && s.composerBudgetDead) {
      console.log(`[agents] QA failed but composer budget is exhausted — delivering best attempt (no repair lap)`);
    }
    return END;
  }, ["repair", END]);
  g.addEdge("repair", "qa_agent");

  compiledGraph = g.compile();
  return compiledGraph;
}

// ---------------------------------------------------------------- runner
async function runProductionGraph({ jobId }) {
  const job = db.getRaw(jobId);
  if (!job || !job.script) {
    console.error(`[agents] ${jobId} aborted: no approved script`);
    return;
  }
  const jobDir = jobDirFor(jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  db.markStarted(jobId);

  const tracker = new UsageTracker();
  const t0 = ms();
  const script = normalizeScript(job.script, { targetDuration: job.duration });

  try {
    const graph = await buildGraph();
    const final = await graph.invoke(
      { job, jobDir, tracker, brief: job.brief, script, qaAttempts: 0 },
      { recursionLimit: 40 }
    );

    const costs = tracker.computeCosts();
    db.markDone(jobId, {
      videoUrl: final.visual.videoUrl,
      usedFallback: final.usedFallback === true,
      tokensIn: costs.llm.inputTokens,
      tokensOut: costs.llm.outputTokens,
      usage: costs,
      stageTimings: { ...(job.stage_timings || {}), productionMs: ms() - t0 },
      finalAttempt: final.finalAttempt || "main",
    });
    if (final.qa) db.setQa(jobId, final.qa);
    console.log(`[agents] ${jobId} done — ${final.finalAttempt}, qa=${final.qa?.pass === false ? "FAILED(delivered best attempt)" : final.qa?.skipped ? "skipped" : "pass"}, cost=$${costs.totalCostUsd}`);
  } catch (err) {
    console.error(`[agents] ${jobId} graph failed: ${err.message}`);
    const costs = tracker.computeCosts();
    db.markFailed(jobId, err.message.slice(0, 2000), costs.llm.inputTokens, costs.llm.outputTokens, costs);
  }
}

module.exports = { runProductionGraph };
// Test seam: expose the deterministic asset-planning stage so its duration-adaptive
// budget + scene-purpose routing can be regression-tested without a full graph run.
// buildGraph is exposed so the TOPOLOGY itself is testable. LangGraph validates node names,
// edge endpoints and channel collisions at compile() — none of which any existing test
// reached, because test-production-integration.js exercises the legacy project_pipeline
// path. A mistyped edge would otherwise surface for the first time mid-render.
module.exports.__test = { assetPlannerAgent, validateBeforeRender, frameSelectorAgent, buildGraph };
