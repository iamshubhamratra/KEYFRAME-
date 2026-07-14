// Orchestrates a multi-tier pipeline that degrades gracefully on failure:
//
//   1. Full: storyboard → [assets: plan + parallel-fetch] → compose → lint (+ repair) → render
//   2. Retry WITHOUT videos (keeps images) if render or compose fails
//   3. Retry WITHOUT any assets if still failing
//   4. Polished deterministic fallback composition
//
//   Then ALWAYS: if any audio flag was requested, plan + fetch + mix it in.
//   So a failure in the visual layer never loses TTS / music / SFX.
//
// Collects per-stage timings and per-job usage/cost via UsageTracker,
// attached to the job record.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const logger = require("./logger");
const { UsageTracker } = require("./usage");
const { generateStoryboard } = require("./storyboard");
const { generateBrief } = require("./brief");
const { generateDressing } = require("./set_dressing");
const { compose } = require("./composer");
const { validate, runInspect } = require("./validator");
const { runtimeCheck } = require("./runtime_check");
const { normalizeComposition, stripMissingAssets } = require("./normalize");
const { enrichComposition } = require("./enrich");
const { cinematicCheck } = require("./cinematic_lint");
const sceneKit = require("./scene_kit");
const threeComposer = require("./three_composer");
const flagshipComposer = require("./flagship_composer");
const brightlifeComposer = require("./brightlife_composer");
const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");
const { render } = require("./renderer");
const { buildFallback } = require("./fallback");
const { planAudio } = require("./audio_planner");
const { directAudio, summarizeDecision: summarizeAudioDecision } = require("./audio_director");
const { synthesize: ttsSynthesize } = require("./tts");
const { synthesizeFitted } = require("./vo_fit");
const { fetchMusic, fetchSfx } = require("./audio_sources");
const { mix: audioMix } = require("./audio_mix");
const { planAssets } = require("./asset_planner");
const { acquire, makeImageDeduper } = require("./asset_sources");
const { checkAssetsRelevance } = require("./asset_vision");
const { reviewAndCurate } = require("./creative_director");
const { styleFor } = require("./pack_style");
const catalog = require("./catalog");
const { contrastCheck } = require("./contrast_check");

function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }
function ms() { return Date.now(); }

// Mechanical fallback queries so a too-specific search degrades to a broader
// one instead of failing: drop the last word, then keep only the first two.
function fallbackQueriesFor(query) {
  const words = String(query).trim().split(/\s+/);
  const out = [];
  if (words.length >= 3) out.push(words.slice(0, -1).join(" "));
  if (words.length >= 2) out.push(words.slice(0, 2).join(" "));
  return [...new Set(out)].filter((q) => q !== query);
}

// Fold a creative brief into a rich, directive storyboard prompt — the brief
// agent turns a terse prompt ("gym app") into audience/tone/goal/key-messages,
// which makes the storyboard write a real script instead of a flat one.
function enrichedStoryboardPrompt(brief, rawPrompt) {
  const lines = [String(brief.improvedPrompt || rawPrompt).trim(), ""];
  if (brief.audience) lines.push(`Audience: ${brief.audience}`);
  if (brief.tone) lines.push(`Tone: ${brief.tone}`);
  if (brief.goal) lines.push(`Goal: ${brief.goal}`);
  if (Array.isArray(brief.keyMessages) && brief.keyMessages.length) {
    lines.push("Key messages (weave these across the scenes):", ...brief.keyMessages.map((m) => `- ${m}`));
  }
  if (Array.isArray(brief.mustIncludeFacts) && brief.mustIncludeFacts.length) {
    lines.push("Must include:", ...brief.mustIncludeFacts.map((m) => `- ${m}`));
  }
  return lines.join("\n");
}

// Wrap a promise factory with a hard wall-clock timeout AND signal-based
// cancellation so the underlying work can actually stop (not just be
// ignored). `factory(signal)` must honor the AbortSignal — used by the
// renderer to kill its subprocess promptly.
function withBudget(factory, budgetMs, label) {
  const ac = new AbortController();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      ac.abort(new Error(`${label} exceeded budget of ${budgetMs}ms`));
      reject(new Error(`${label} exceeded budget of ${budgetMs}ms`));
    }, budgetMs);
    Promise.resolve(factory(ac.signal)).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

// ========== Visual assets stage (parallel fetches) ==========

async function planAndFetchAssets({ jobId, jobDir, storyboard, flags, orientation, tracker, subject, framePack }) {
  if (!flags.images && !flags.video) return { assets: [] };

  const packStyle = styleFor(framePack);
  const { plan, tokensIn, tokensOut, error } = await planAssets(storyboard, {
    images: flags.images, video: flags.video,
  });
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "assets" });

  if (error) {
    console.warn(`[pipeline] asset planner failed (${error}); continuing without visuals`);
    return { assets: [] };
  }

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "assets", "videos"), { recursive: true });

  const tasks = [];

  if (flags.images && Array.isArray(plan.images)) {
    plan.images.forEach((a, i) => {
      const relPath = `assets/images/${i}.jpg`;
      const absPath = path.join(jobDir, relPath);
      // Anchor to the film's subject (on-topic stock), then add the pack's visual
      // style (matches the look). Un-styled + plain queries kept as fallbacks.
      const base = subject ? `${subject} ${a.query}` : a.query;
      const q = packStyle.photoMod ? `${base} ${packStyle.photoMod}` : base;
      tasks.push(
        acquire({
          query: q,
          fallbackQueries: [...new Set([base, a.query, ...fallbackQueriesFor(q)])],
          type: "image", orientation, outputPath: absPath, tracker,
          styleKeywords: packStyle.keywords,
        })
          .then((got) => got ? {
            path: path.relative(jobDir, got.path).split(path.sep).join("/"), type: "image",
            sceneId: a.sceneId, startSec: a.startSec,
            durationSec: a.durationSec, style: a.style, alt: a.alt,
            width: got.width, height: got.height, ratio: got.ratio, hasAlpha: got.hasAlpha, dhash: got.dhash,
            license: got.license, sourceUrl: got.sourceUrl, source: got.source,
          } : null)
          .catch(() => null)
      );
    });
  }

  if (flags.video && Array.isArray(plan.videos)) {
    plan.videos.forEach((a, i) => {
      const relPath = `assets/videos/${i}.mp4`;
      const absPath = path.join(jobDir, relPath);
      tasks.push(
        acquire({
          query: a.query, fallbackQueries: fallbackQueriesFor(a.query),
          type: "video", orientation, outputPath: absPath, tracker,
        })
          .then((got) => got ? {
            path: path.relative(jobDir, got.path).split(path.sep).join("/"), type: "video",
            sceneId: a.sceneId, startSec: a.startSec,
            durationSec: a.durationSec, style: a.style,
            license: got.license, sourceUrl: got.sourceUrl, source: got.source,
          } : null)
          .catch(() => null)
      );
    });
  }

  const results = (await Promise.all(tasks)).filter(Boolean);

  // De-dupe by EXACT (MD5) + PERCEPTUAL (dHash) match — several planner queries
  // resolve to the same, or a visually-identical re-encode of the same, stock
  // file, which otherwise repeats across the montage. (Parity with the agent
  // graph.) Videos skip the perceptual pass.
  const deduper = makeImageDeduper();
  const deduped = [];
  for (const item of results) {
    const abs = path.join(jobDir, item.path);
    if (item.type === "video") { deduped.push(item); continue; }
    const dup = await deduper.check(abs, item.dhash);
    if (dup) { try { fs.unlinkSync(abs); } catch { /* noop */ } continue; }
    deduped.push(item);
  }

  // CREATIVE DIRECTOR (default ON) — richer replacement for the plain vision
  // gate below: scores every asset on six dimensions, assigns each to a scene,
  // ranks screenshots, caps prominent assets per scene, and can top-up a scene
  // left empty. Fail-open (returns the assets unchanged on any error). The old
  // keep/reject gate remains the fallback when disabled (CREATIVE_DIRECTOR=0).
  const cdEnabled = config.creativeDirector ? config.creativeDirector.enabled !== false : true;
  if (cdEnabled && deduped.length) {
    const curated = await reviewAndCurate({
      jobId, storyboard, subject, framePack,
      assets: deduped, tracker, jobDir, orientation,
    });
    // null = CD disabled or failed — fall through to the legacy vision gate
    // below so web stock still gets a chance at verified (visionOk) placement.
    if (curated) {
      console.log(`[pipeline] fetched ${results.length} → ${curated.length} visual asset(s) (dedup + creative director)`);
      return { assets: curated };
    }
  }

  // VISION RELEVANCE GATE (batched) — gate ONLY real web stock; curated picks
  // carry no provider source and stay trusted. One batched call (chunks of 6),
  // fail-open. Brings /api/generate to the agent graph's asset-quality bar.
  const PROVIDER_SOURCES = new Set(["pixabay", "openverse", "pexels", "pixabay_scrape"]);
  let survivors = deduped;
  const webStock = deduped.filter((it) => PROVIDER_SOURCES.has(it.source));
  if (subject && webStock.length) {
    const verdicts = await checkAssetsRelevance({
      assets: webStock.map((it) => ({ absPath: path.join(jobDir, it.path), type: it.type, query: it.alt })),
      subject, tracker,
    }).catch(() => webStock.map(() => ({ keep: true })));
    const rejected = new Set();
    verdicts.forEach((v, i) => {
      if (v && v.keep === false) {
        const it = webStock[i];
        rejected.add(it);
        try { fs.unlinkSync(path.join(jobDir, it.path)); } catch { /* noop */ }
        console.warn(`[pipeline] asset REJECTED by vision gate (shows "${v.sees || "?"}", film about "${subject}") — "${it.alt || ""}"`);
      } else if (v && v.sees) {
        // VERIFIED on-topic (model saw + approved) — eligible for prominent
        // slots in scene_kit (montage/split). Fail-open passes (no `sees`)
        // stay unverified: kept, but background-scrim only.
        webStock[i].visionOk = true;
        webStock[i].sees = v.sees;
      }
    });
    if (rejected.size) survivors = deduped.filter((it) => !rejected.has(it));
  }

  console.log(`[pipeline] fetched ${results.length} → ${survivors.length} visual asset(s) (dedup + vision gate)`);
  return { assets: survivors };
}

// ========== Composition + lint repair ==========

// Legibility gate for the LLM-composer path — DEFAULT ON in "warn" mode
// (2026-07-10): the grok premium test shipped an iridescent gradient emphasis
// that washed out against prism-launch's light ground, exactly the failure
// class this gate exists for, so it now runs by default and LOGS every
// low-contrast element. It defaults to WARN, not REPAIR, because a contrast
// repair lap re-invokes the composer, and on the grok primary that 156KB prompt
// frequently 524-storms on KIE's edge — a verified run took 48min and blew the
// 45min composition budget doing two contrast-repair laps. Warn catches the
// problem with zero added latency; opt into auto-repair with CONTRAST_GATE=repair
// when the latency budget allows (or once the composer prompt/provider is faster).
// Only the LLM (remix) path calls this; scene-kit stays gate-free (contrast-clean
// by construction).
//   CONTRAST_GATE=off/0/false/no → disable entirely
//   CONTRAST_GATE=warn           → (the default) run + log low-contrast text, never block
//   CONTRAST_GATE=repair         → (also 1/on/true/yes) feed it back as a soft repair
//                                   signal; on exhaustion the comp still ships (contrastOnly)
function contrastMode() {
  const v = String(process.env.CONTRAST_GATE || "").toLowerCase();
  if (/^(off|0|false|no)$/.test(v)) return "off";
  if (/^(1|true|yes|on|repair)$/.test(v)) return "repair";
  return "warn";
}

// Runs the WCAG contrast audit (contrast_check.js) on the just-gated composition.
// Returns { ok:true } to ship, or { ok:false, contrastOnly:true, feedback } to
// request a repair lap. NEVER throws/blocks on checker trouble (mirrors runtime +
// inspect): a missing Chromium or a hung pass returns ok:true.
async function contrastGate(jobDir, label) {
  const mode = contrastMode();
  if (mode === "off") return { ok: true };
  let res;
  try {
    res = await contrastCheck(jobDir, { samples: 8, timeoutMs: 75000 });
  } catch (e) {
    console.warn(`[pipeline] contrast gate errored (${String(e.message).slice(0, 120)}) — not blocking`);
    return { ok: true };
  }
  if (res.skipped) { console.log(`[pipeline] contrast gate skipped (${res.skipped})`); return { ok: true }; }
  const fails = res.persistentFailures || [];
  if (!fails.length) { console.log(`[pipeline] contrast gate: all text clears WCAG AA (${label})`); return { ok: true }; }
  const lines = fails.slice(0, 10)
    .map((f) => `at ${f.bestTime}s ${f.selector} "${String(f.text).slice(0, 40)}" — ${f.bestRatio}:1 (need ${f.needed}:1)`)
    .join("\n");
  console.warn(`[pipeline] contrast gate: ${fails.length} low-contrast text element(s) (${label}):\n${lines}`);
  if (mode === "warn") return { ok: true };
  return {
    ok: false,
    contrastOnly: true,
    feedback: `Previous HTML passed lint + runtime + spatial inspect but FAILED the WCAG contrast check — this text is too low-contrast to read against what is rendered behind it:\n${lines}\nFIX: raise each listed element to at least its needed ratio — brighten the text color on a dark ground (or darken it on a light ground), or move it onto a more contrasting panel/scrim. Stay within the pack's palette family; do NOT invent new colors and do NOT introduce any lint/track/overlap regressions. Keep everything that already passed.`,
  };
}

// Normalize + install catalog blocks + lint + runtime-smoke one composer output.
// Returns { ok, feedback } — feedback is the next-lap repair brief when !ok.
async function gateComposition({ files, jobDir, tracker, label, enrich, cinematic }) {
  // ENRICH FIRST — inject the deterministic anti-void background + always-on
  // animated vector/effects layer BEFORE normalize+lint, so the enriched HTML is
  // what gets validated and rendered, and reflowTrackOverlaps fixes any track
  // collision the injected clips introduce. Idempotent (skips if already done).
  if (enrich) {
    try {
      const en = enrichComposition(files.indexHtml, enrich);
      if (en.changed) {
        files.indexHtml = en.html;
        console.log(`[pipeline] enriched ${label}: +design-system background +animated vector layer`);
      }
    } catch (e) {
      console.warn(`[pipeline] enrichment skipped (${e.message.slice(0, 120)})`);
    }
  }

  const norm = normalizeComposition(files.indexHtml);
  if (norm.changed.length) {
    files.indexHtml = norm.html;
    console.log(`[pipeline] normalized ${label}: ${norm.changed.join(", ")}`);
  }

  // Backstop: drop any <img>/<video> pointing at a local file that wasn't
  // actually fetched (the composer occasionally invents 3.jpg/4.jpg) — prevents
  // broken/blank images and a wasted "missing asset" lint repair lap.
  const strip = stripMissingAssets(files.indexHtml, jobDir);
  if (strip.removed) {
    files.indexHtml = strip.html;
    console.log(`[pipeline] stripped ${strip.removed} <img>/<video> with a missing local src (${label})`);
  }

  try {
    const r = await catalog.installReferencedBlocks(files.indexHtml, jobDir);
    if (r.installed.length) tracker.addExternal("catalog_install");
    if (r.failed.length) console.warn(`[pipeline] catalog installs failed for: ${r.failed.join(", ")}`);
  } catch (e) {
    console.warn(`[pipeline] catalog install step threw: ${e.message}`);
  }

  tracker.addExternal("hyperframes_lint");
  const lint = await validate(jobDir, { indexHtml: files.indexHtml, metaJson: files.metaJson });
  if (!lint.ok) {
    console.warn(`[pipeline] hyperframes lint FAILED (${label}):\n${String(lint.stderr || lint.stdout || "(no output)").slice(-2000)}`);
    return { ok: false, feedback: `Previous HTML failed hyperframes lint with:\n${lint.stderr || lint.stdout}\nFix ONLY these specific issues and DO NOT introduce new lint violations (especially: keep clips on disjoint tracks, no overlapping clips on one track; use CSS opacity:0 for initial hidden state, never gsap.set() for it). Preserve everything that already passed.` };
  }

  // Static lint can't catch a script that THROWS at runtime (→ blank video).
  const rt = await runtimeCheck(jobDir).catch((e) => ({ ok: true, skipped: e.message }));
  if (!rt.ok) {
    console.warn(`[pipeline] composition lint-clean but FAILED runtime smoke (${label}): ${rt.error}`);
    return { ok: false, feedback: `Previous HTML passed structural lint but ${rt.error}. The composition MUST run without throwing AND register window.__timelines["vid"]. A common cause is misusing a GSAP function-based value: the callback signature is function(index, element, targets) — read the element from the 2nd argument; NEVER call this.target() (it is not a function). Fix the script so it executes cleanly end to end.` };
  }

  // Spatial layout audit (hyperframes inspect) — catches cards/text occluding
  // each other in SPACE, which lint (time-only) and runtime (does-it-throw) miss.
  // This is the gate for the "random overlapping cards" symptom. inspectOnly:true
  // marks a comp that is structurally/ runtime sound but has spatial overlaps —
  // the caller ships it on the final lap (a real comp beats the bland fallback).
  tracker.addExternal("hyperframes_inspect");
  const insp = await runInspect(jobDir).catch(() => ({ ok: true, skipped: true }));
  if (insp.ok) {
    // CINEMATIC DENSITY — DIAGNOSTIC ONLY (does NOT bounce the comp). It logs how
    // many showcase-density signals are absent (per-scene camera, layer density, a
    // reactive beat, ambient, gradients) so the gap is observable, but it must NOT
    // gate shipping: its gradient/glow/camera doctrine is a DARK-CINEMATIC aesthetic
    // that conflicts with FLAT/editorial packs (blockframe etc. forbid gradients),
    // and on the budget model the density push trades cleanliness for occlusion.
    // Kept as a tool (cinematic_lint.js) + a log; not a hard/soft gate.
    try {
      const cine = cinematicCheck(files.indexHtml, cinematic || {});
      if (cine.errors.length || cine.warnings.length) {
        console.log(`[pipeline] cinematic density (diagnostic, ${label}): ${cine.errors.length} thin-signal(s), ${cine.warnings.length} note(s) — not blocking`);
      }
    } catch (e) { console.warn(`[pipeline] cinematic check threw: ${e.message.slice(0, 120)}`); }
    // Legibility gate (opt-in, LLM path only) — the readability dimension lint
    // (time) and inspect (space) miss. Off unless CONTRAST_GATE is set.
    if (contrastMode() !== "off") {
      tracker.addExternal("contrast_gate");
      const cg = await contrastGate(jobDir, label);
      if (!cg.ok) {
        console.warn(`[pipeline] contrast gate FAILED (${label}) — requesting repair`);
        return cg;
      }
    }
    console.log(`[pipeline] lint + runtime + spatial inspect passed (${label})${rt.skipped ? ` (smoke skipped)` : ""}${insp.skipped ? ` (inspect skipped)` : ""}`);
    return { ok: true };
  }
  const issueLines = insp.errors.slice(0, 12).map((i) =>
    `at ${i.time}s ${i.selector}${i.containerSelector ? ` (in ${i.containerSelector})` : ""}: ${i.message}${i.fixHint ? ` — ${i.fixHint}` : ""}`
  ).join("\n");
  console.warn(`[pipeline] spatial inspect FAILED (${label}): ${insp.errors.length} occlusion error(s)`);
  return {
    ok: false,
    inspectOnly: true,
    feedback: `Previous HTML passed lint + runtime but FAILED the spatial layout inspect — content is OVERLAPPING / OCCLUDING in space:\n${issueLines}\nFIX: lay sibling cards/panels/labels out in a flex or grid container with an explicit gap so they NEVER overlap; reserve position:absolute for decoratives only; give each scene's content its own zone. If a layer is intentionally stacked over another, add data-layout-allow-occlusion to it. Keep everything that already passed.`,
  };
}

async function composeWithLintRepair({ storyboard, dims, jobDir, availableAssets, tracker, abortSignal, framePack, captionCues }) {
  // First pass + up to N repair laps. Weaker/reasoning composer models often fix
  // the flagged errors on a repair but introduce a NEW class (e.g. nemotron clears
  // track overlaps, then trips gsap_set_initial_state) — a single lap can't
  // converge, so it falls back. Allow a few laps before escalating.
  const maxRepairs = Math.max(1, Number(config.llm.composerLintRepairs) || 2);

  let feedback = null;
  // Best lint+runtime-clean, occlusion-only lap (NORMALIZED, post-gate). Snapshot
  // it so that on exhaustion we ship the RICH asset-ful comp with only a residual
  // decorative overlap — never strip it. gateComposition writes each lap to disk,
  // so on exhaustion we must re-persist the best snapshot (a later regressing lap
  // may have overwritten index.html); render() reads jobDir/index.html.
  let bestInspectFiles = null;
  // Deterministic enrichment context (anti-void background + animated vector
  // layer), applied inside gateComposition before normalize+lint.
  const enrich = {
    width: dims.width, height: dims.height, duration: storyboard.durationSec,
    packTokens: framePack ? frameRegistry.getPackTokens(framePack) : null,
  };
  // Context for the cinematic density gate (per-scene checks + the C7 screenshot rule).
  const cinematic = {
    duration: storyboard.durationSec,
    scenes: storyboard.scenes,
    assets: availableAssets,
  };
  for (let lap = 0; lap <= maxRepairs; lap++) {
    const label = lap === 0 ? "first pass" : `repair ${lap}/${maxRepairs}`;
    console.log(`[pipeline] composeWithLintRepair: composer (${label})`);
    const sb = feedback ? { ...storyboard, __lintFeedback: feedback } : storyboard;
    let files;
    try {
      files = await compose(sb, {
        width: dims.width, height: dims.height, fps: dims.fps,
        duration: storyboard.durationSec,
        maxRetries: lap === 0 ? config.llm.composerMaxRetries : 1,
        availableAssets, abortSignal, framePack, captionCues,
      });
    } catch (e) {
      // A REPAIR lap that hard-fails (e.g. a transient 403/timeout on the
      // composer) must NOT discard a good earlier lap and collapse to the bland
      // deterministic template. If we already captured a lint+runtime-clean
      // (occlusion-only) composition, ship THAT — a real, rich comp with a
      // residual decorative overlap beats the fallback every time.
      if (lap > 0 && bestInspectFiles) {
        console.warn(`[pipeline] repair lap ${lap} compose failed (${String(e.message).slice(0, 140)}) — shipping best earlier lap instead of the bland fallback`);
        break;
      }
      throw e; // lap 0 failed with no good comp yet — let the caller fall back
    }
    tracker.addLlm({ inputTokens: files.tokensIn, outputTokens: files.tokensOut, stage: "composer" });

    const res = await gateComposition({ files, jobDir, tracker, label, enrich, cinematic });
    if (res.ok) return { files };
    // inspectOnly / contrastOnly => lint + runtime PASSED (and spatial inspect too,
    // for contrastOnly); only a residual spatial overlap or a low-contrast label
    // remains. Snapshot the NORMALIZED html (gateComposition mutated it in place) so
    // that on exhaustion we ship this rich comp rather than the bland fallback.
    if ((res.inspectOnly || res.contrastOnly) && !bestInspectFiles) {
      bestInspectFiles = { indexHtml: files.indexHtml, metaJson: files.metaJson };
    }
    feedback = res.feedback;
    if (lap < maxRepairs) console.warn(`[pipeline] attempting repair (lap ${lap + 1}/${maxRepairs})`);
  }

  // Exhausted repair laps. Ship the BEST asset-ful, lint+runtime-clean,
  // occlusion-only lap — a rich comp with a residual decorative overlap beats the
  // bland fallback. Re-persist to disk: render() reads jobDir/index.html and a
  // later regressing lap may have overwritten it.
  if (bestInspectFiles) {
    fs.writeFileSync(path.join(jobDir, "index.html"), bestInspectFiles.indexHtml, "utf8");
    fs.writeFileSync(path.join(jobDir, "meta.json"), bestInspectFiles.metaJson, "utf8");
    console.warn(`[pipeline] shipping best asset-ful occlusion-only lap after ${maxRepairs} lap(s) — real comp beats fallback`);
    return { files: bestInspectFiles };
  }
  // A composition that still trips lint/runtime renders wrong or blank — worse
  // than the deterministic fallback. Let the caller escalate.
  throw new Error(`composition still failed gate after ${maxRepairs} repair lap(s): ${String(feedback || "").slice(-400)}`);
}

// ========== One attempt at full LLM comp + render with a given asset set ==========

async function attemptLlmComposition({ storyboard, dims, jobDir, assets, tracker, jobId, durationSec, label, abortSignal, framePack, captionCues, remix = false, dress = false, subject = null }) {
  // DEFAULT = the deterministic scene-kit (guaranteed showcase-grade, lint-clean,
  // per-pack styled). Every pipeline path (runJob, graph, project_pipeline) routes
  // through here, so this single dispatch makes the kit the primary composer
  // everywhere. The LLM path below runs only on an explicit `remix: true` opt-in.
  // `dress` (premium hybrid): a small bounded LLM pass art-directs the kit's
  // variants/emphasis/decor without any power to break the layout.
  if (!remix) {
    return composeWithSceneKit({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "scene-kit", abortSignal, tracker, dress, subject });
  }
  const t0 = ms();
  console.log(`[pipeline] ${label}: LLM remix compose start (assets=${assets.length}, framePack=${framePack || "none"})`);
  await composeWithLintRepair({
    storyboard, dims, jobDir, availableAssets: assets, tracker, abortSignal, framePack, captionCues,
  });
  console.log(`[pipeline] ${label}: compose done in ${ms() - t0}ms, render start`);
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  console.log(`[pipeline] ${label}: render done in ${ms() - t0}ms total`);
  return visual;
}

// PRIMARY composition path — the deterministic SCENE-KIT. Builds a complete,
// showcase-grade, per-pack-styled composition from the storyboard in CODE (no LLM
// freehand → lint-clean by construction, no occlusion/truncation/junk). The agents
// still "think" (they wrote the storyboard + picked the assets); the kit guarantees
// the execution. This is the reliable default; the LLM composer is the opt-in remix.
async function composeWithSceneKit({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label, abortSignal, tracker, dress = false, subject = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "scene-kit"}: building deterministic composition (assets=${assets ? assets.length : 0}, framePack=${framePack || "none"}${dress ? ", +set-dressing" : ""})`);
  // Premium hybrid: one bounded LLM pass picks per-scene layout variants, the
  // accent word, and a sanitized decorative SVG cluster. Fail-open — a null
  // dressing renders the plain kit.
  let dressing = null;
  if (dress) {
    dressing = await generateDressing({ storyboard, framePack, subject, tracker, signal: abortSignal }).catch(() => null);
    if (dressing) console.log(`[pipeline] ${label || "scene-kit"}: set-dressing applied to ${Object.keys(dressing).length} scene(s)`);
  }
  // seedKey=jobId: layout/background variety is salted per JOB, so re-running the
  // same prompt (same title) still produces a visibly different composition.
  const built = sceneKit.buildComposition({ storyboard, dims, framePack, assets: assets || [], captionCues, seedKey: jobId, dressing });
  // Apply the deterministic vector/motion floor (the same enrichment the LLM path
  // uses) so scene-kit videos also carry the richer particle + glyph + ring layer.
  // scene-kit emits the `vid` markers enrich needs; its own particles use class
  // "kfx"-free names so there's no selector collision.
  let indexHtml = built.indexHtml;
  try {
    const en = enrichComposition(indexHtml, {
      width: dims.width, height: dims.height, duration: durationSec,
      packTokens: framePack ? frameRegistry.getPackTokens(framePack) : null,
    });
    if (en.changed) { indexHtml = en.html; console.log(`[pipeline] ${label || "scene-kit"}: +vector/motion floor`); }
  } catch (e) { console.warn(`[pipeline] scene-kit enrich skipped (${String(e.message).slice(0, 120)})`); }
  fs.writeFileSync(path.join(jobDir, "index.html"), indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  // The kit is lint-clean by construction; run the real lint anyway as a safety net
  // (a pathological storyboard could still trip something) — log, never block.
  tracker.addExternal("hyperframes_lint");
  const lint = await validate(jobDir, { indexHtml, metaJson: built.metaJson }).catch((e) => ({ ok: true, skipped: e.message }));
  if (!lint.ok) console.warn(`[pipeline] scene-kit lint (non-blocking): ${String(lint.stderr || lint.stdout || "").slice(-300)}`);
  console.log(`[pipeline] ${label || "scene-kit"}: built in ${ms() - t0}ms, render start`);
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  console.log(`[pipeline] ${label || "scene-kit"}: render done in ${ms() - t0}ms total`);
  return visual;
}

// "Asset-rich" = the video carries enough real screenshots/photos that the 2D
// composer (which weaves 8-10 assets across montage/split/B-roll) showcases them
// far better than the 3D composer, which only textures ONE screenshot and drops
// the rest. Icons/vectors (.svg) don't count — they're decorative, not the
// screenshots/photos a user actually wants to see on screen. Used to override an
// opt-in render3d request when the video is really an asset showcase.
function isAssetRich(assets) {
  const showcase = (assets || []).filter((a) =>
    a && a.path && (a.source === "website" || /\.(jpe?g|png|webp)$/i.test(String(a.path))));
  return showcase.length >= 3;
}

// 3D style dispatch. Three cinematic registers share the buildComposition
// envelope: "flagship" (dark Apple/Linear launch film), "brightlife" (its
// white/daylight sibling), and "classic" (the original CRT retro-computer
// three_composer). Default is AUTO: the pack's derived theme decides — dark
// ground → flagship, light ground → brightlife. Override per-deploy with
// RENDER3D_STYLE=classic|flagship|brightlife|auto.
function pick3dComposer(framePack, storyboard) {
  const want = String(process.env.RENDER3D_STYLE || "auto").toLowerCase();
  if (want === "classic") return { styleName: "classic", composer: threeComposer };
  if (want === "flagship") return { styleName: "flagship", composer: flagshipComposer };
  if (want === "brightlife") return { styleName: "brightlife", composer: brightlifeComposer };
  let isDark = true;
  try { isDark = require("./scene_kit").deriveTheme(framePack, storyboard).isDark !== false; } catch { /* default dark */ }
  return isDark
    ? { styleName: "flagship", composer: flagshipComposer }
    : { styleName: "brightlife", composer: brightlifeComposer };
}

// THREE.JS composition path (opt-in via render3d) — a cinematic WebGL scene with
// DOM text overlays, driven by the same seeked timeline. Self-contained: no enrich
// (it has its own 3D particle field) and no stock-asset weaving (visuals are
// generated, not fetched).
async function composeWithThree({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker }) {
  const t0 = ms();
  const { styleName, composer } = pick3dComposer(framePack, storyboard);
  console.log(`[pipeline] ${label || "three"}: building Three.js/WebGL composition (style=${styleName}, ${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = composer.buildComposition({ storyboard, dims, framePack, captionCues, assets });
  fs.writeFileSync(path.join(jobDir, "index.html"), built.indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  console.log(`[pipeline] ${label || "three"}: render done in ${ms() - t0}ms total`);
  return visual;
}

// ========== Per-scene VO + sync re-timing ==========

const r2 = (n) => Math.round(n * 100) / 100;
const clampSceneDur = (n) => Math.max(2, Math.min(15, n));
const VO_TAIL = 0.55; // breathing room after a spoken line finishes

// The narration for one scene: its authored `voiceover`, else a spoken version
// of its on-screen text (so a scene without an authored line still gets synced
// narration rather than silence).
function sceneVOText(scene) {
  const explicit = String(scene.voiceover || "").trim();
  if (explicit) return explicit;
  return [scene.headline, scene.subtext].map((s) => String(s || "").trim()).filter(Boolean).join(". ");
}

// THE SYNC FIX. Synthesize each scene's narration, then stretch each scene's
// on-screen duration to comfortably contain its line and pin the clip to the
// scene's start. Audio and video are locked together, replacing the old single
// VO blob that drifted against the cut. Mutates storyboard scene start/duration
// + durationSec in place; returns { voClips (kind:"vo" at offsets), effectiveDuration }.
async function synthesizeScenedVOAndRetime({ audioDir, storyboard, voice, instructions, requestedDuration, tracker }) {
  const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];
  fs.mkdirSync(audioDir, { recursive: true });

  // Synthesize every narrated scene in parallel; synthesizeFitted keeps a runaway
  // line from overrunning wildly (tighten-once + hard trim), and reports the
  // measured spoken duration we re-time against.
  const clips = await Promise.all(scenes.map((scene, i) => {
    const text = sceneVOText(scene);
    if (!text) return Promise.resolve(null);
    const targetSec = Math.max(2, Number(scene.duration) || 3);
    return synthesizeFitted({
      text, targetSec, voice, instructions,
      outputPath: path.join(audioDir, `vo-s${i + 1}.mp3`), tracker,
    })
      .then((res) => (res ? { index: i, path: res.path, durationSec: res.durationSec } : null))
      .catch((e) => { console.warn(`[pipeline] scene ${i + 1} VO failed: ${e.message.slice(0, 120)}`); return null; });
  }));

  const byIndex = new Map(clips.filter(Boolean).map((c) => [c.index, c]));
  let cursor = 0;
  const voClips = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const clip = byIndex.get(i);
    const need = clip ? clip.durationSec + VO_TAIL : 0;
    s.duration = r2(clampSceneDur(Math.max(2, Number(s.duration) || 3, need)));
    s.start = r2(cursor);
    if (clip) voClips.push({ path: clip.path, startSec: s.start, durationSec: clip.durationSec, kind: "vo", volume: 1.0 });
    cursor = r2(cursor + s.duration);
  }
  const effectiveDuration = r2(cursor) || Number(requestedDuration) || 12;
  storyboard.durationSec = effectiveDuration;
  return { voClips, effectiveDuration };
}

// ========== Audio assets stage ==========

async function buildAudio({ jobDir, storyboard, flags, tracker, perScene = false, framePack = null, brief = null }) {
  const audioDir = path.join(jobDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  // The frame pack (template) can carry its own BGM lane + SFX palette; pass it to
  // the planner so the audio matches the template's sound (and a template with
  // built-in music still plays it if the planner returns none).
  const packAudio = framePack ? (frameManifest.getManifest(framePack)?.audio || null) : null;
  const { plan, tokensIn, tokensOut, error: planErr } = await planAudio(storyboard, flags, packAudio);
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "audio" });

  if (planErr) {
    console.warn(`[pipeline] audio planner failed: ${planErr}. Skipping audio.`);
    return { ttsPath: null, musicPath: null, sfx: [], musicVolume: 0.15 };
  }

  // AUDIO DIRECTOR — decide whether music/SFX are actually needed, curate the best
  // bed + the handful of SFX that land on real moments, and set voice-aware levels.
  // Runs before any fetch, so we only download what the director keeps. Fail-open:
  // returns the planner draft unchanged on any error.
  let directed = plan;
  try {
    const res = await directAudio({
      storyboard, plan, brief, hasVoice: flags.tts === true,
      duration: storyboard.durationSec, tracker,
    });
    directed = res.plan || plan;
    console.log(`[audio-director] ${summarizeAudioDecision(directed, res.decision)}`);
  } catch (e) {
    console.warn(`[audio-director] stage threw, keeping draft: ${String(e.message).slice(0, 120)}`);
  }
  // Overlay the directed choices onto `plan` so the rest of buildAudio (which reads
  // `plan.music` / `plan.soundEffects` / `plan.tts`) uses the curated audio.
  plan.music = directed.music;
  plan.soundEffects = directed.soundEffects;
  plan.musicEnvelope = directed.musicEnvelope; // scene-INDEXED; mapped to seconds at mix time
  plan.ambient = directed.ambient;

  // Run TTS + music + all SFX fetches in parallel. In perScene mode the VO is
  // synthesized per scene by synthesizeScenedVOAndRetime (for A/V sync), so we
  // SKIP the single-blob TTS here and just surface the resolved voice/instructions.
  const ttsTask = (!perScene && flags.tts && plan.tts)
    ? ttsSynthesize({
        script: plan.tts.script, voice: plan.tts.voice,
        instructions: plan.tts.instructions,
        outputPath: path.join(audioDir, "tts.mp3"), tracker,
      }).then((p) => {
        console.log(`[pipeline] tts generated (${plan.tts.voice})`);
        return p;
      }).catch((e) => {
        console.warn(`[pipeline] tts failed: ${e.message}`);
        return null;
      })
    : Promise.resolve(null);

  let musicVolume = config.audio?.defaultMusicVolume ?? 0.15;
  if (flags.music && plan.music?.volume) musicVolume = plan.music.volume;

  const musicTask = (flags.music && plan.music?.query)
    ? fetchMusic({ query: plan.music.query, outputPath: path.join(audioDir, "music.mp3"), tracker })
        .then((p) => { if (p) console.log(`[pipeline] music fetched ("${plan.music.query}")`); return p; })
        .catch((e) => { console.warn(`[pipeline] music failed: ${e.message}`); return null; })
    : Promise.resolve(null);

  // Ambient texture bed (rare, director-curated) rides the music flag.
  const ambientTask = (flags.music && plan.ambient?.query)
    ? fetchMusic({ query: plan.ambient.query, outputPath: path.join(audioDir, "ambient.mp3"), tracker })
        .then((p) => { if (p) console.log(`[pipeline] ambient fetched ("${plan.ambient.query}")`); return p; })
        .catch((e) => { console.warn(`[pipeline] ambient failed: ${e.message}`); return null; })
    : Promise.resolve(null);

  const sfxPlan = (flags.soundEffect && Array.isArray(plan.soundEffects)) ? plan.soundEffects : [];
  const sfxTasks = sfxPlan.map((s, i) =>
    fetchSfx({ query: s.query, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
      .then((p) => p ? { path: p, startSec: s.startSec, volume: s.volume } : null)
      .catch(() => null)
  );

  const [ttsPath, musicPath, ambientPath, ...sfxResults] = await Promise.all([ttsTask, musicTask, ambientTask, ...sfxTasks]);
  const sfx = sfxResults.filter(Boolean);
  if (sfx.length) console.log(`[pipeline] sfx: ${sfx.length}/${sfxPlan.length} fetched`);

  return {
    ttsPath, musicPath, sfx, musicVolume, plan,
    musicEnvelope: plan.musicEnvelope || null,
    ambientPath, ambientVolume: plan.ambient?.volume,
    ttsVoice: plan.tts?.voice, ttsInstructions: plan.tts?.instructions,
  };
}

// Move the freshly-mixed temp file over the original render. On Windows the
// just-rendered .mp4 can still be held open briefly (render finalize / AV scan),
// so a bare renameSync throws EPERM/EBUSY and silently drops all audio. Retry
// with backoff, then fall back to copy-over-delete (which tolerates an open dest
// on some handles), so a transient lock never loses the mix.
async function replaceFile(srcPath, destPath, { attempts = 6, delayMs = 200 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { fs.renameSync(srcPath, destPath); return; }
    catch (e) {
      lastErr = e;
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  // Last resort: overwrite contents in place, then remove the temp.
  try {
    fs.copyFileSync(srcPath, destPath);
    try { fs.unlinkSync(srcPath); } catch { /* temp cleanup best-effort */ }
    return;
  } catch (e) {
    throw new Error(`could not replace ${path.basename(destPath)} after mix (${lastErr?.code || lastErr?.message}; copy fallback: ${e.message})`);
  }
}

// The director's musicEnvelope is scene-INDEXED (buildAudio runs in parallel with
// VO retiming, so scene starts aren't final until mix time). Convert to seconds
// here, against the storyboard's final timing.
function envelopeToSeconds(scenes, envelope) {
  if (!Array.isArray(envelope) || envelope.length < 2 || !Array.isArray(scenes) || !scenes.length) return null;
  let cursor = 0;
  const starts = scenes.map((s) => {
    const st = Number.isFinite(Number(s.start)) ? Number(s.start) : cursor;
    cursor = st + (Number(s.duration) || 3);
    return st;
  });
  const pts = envelope
    .filter((p) => Number.isInteger(p.scene) && p.scene >= 0 && p.scene < starts.length)
    .map((p) => ({ atSec: starts[p.scene], volume: p.volume }));
  return pts.length >= 2 ? pts : null;
}

async function mixAudioIntoVideo({ visualPath, durationSec, audio, scenes = null, jobDir = null }) {
  if (!audio.ttsPath && !audio.musicPath && !audio.ambientPath && audio.sfx.length === 0) return false;
  const mixedPath = path.join(config.paths.videosDir, path.basename(visualPath) + ".tmp.mp4");
  const { report } = await audioMix({
    videoPath: visualPath, outputPath: mixedPath, durationSec,
    ttsPath: audio.ttsPath, musicPath: audio.musicPath,
    musicVolume: audio.musicVolume,
    musicEnvelope: envelopeToSeconds(scenes, audio.musicEnvelope),
    ambientPath: audio.ambientPath, ambientVolume: audio.ambientVolume,
    sfx: audio.sfx,
    targetLufs: Number(config.audio?.targetLufs) || -14,
    normalize: config.audio?.normalize !== false,
  });
  await replaceFile(mixedPath, visualPath);
  // Honest, MEASURED post-mix report (loudness, true peak, layer inventory) —
  // written next to the job's audio assets for inspection/debugging.
  if (report && jobDir) {
    try {
      fs.writeFileSync(path.join(jobDir, "audio", "audio-report.json"), JSON.stringify(report, null, 2));
      console.log(`[pipeline] audio report: ${report.integratedLufs ?? "?"} LUFS (target ${report.targetLufs}), peak ${report.truePeakDb ?? "?"} dBTP, gain ${report.gainAppliedDb} dB, layers ${JSON.stringify(report.layers)}`);
    } catch { /* report is best-effort */ }
  }
  return true;
}

// ========== Main ==========

async function runJob({
  jobId, prompt, duration, orientation, width, height, fps,
  tts = false, music = false, soundEffect = false, voice,
  images = false, video = false, framePack = null, remix = false, render3d = false, dress = false,
}) {
  const jobDir = jobDirFor(jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const tracker = new UsageTracker();
  const timings = {};
  const markStage = (name, startAt) => { timings[name + "Ms"] = ms() - startAt; };

  db.markStarted(jobId);
  const log = logger.child({ tag: "pipeline", jobId });
  let usedFallback = false;
  let finalAttempt = "main";
  let visualResult = null;
  let sbRes = null;

  const dims = { width, height, fps };
  const wantsAudio = tts || music || soundEffect;
  log.info("job accepted", { dims: `${width}x${height}@${fps}`, duration, orientation, tts, music, images, video, framePack, remix });

  try {
    // ---- Stage: prompt understanding / enhancement (best output) ----
    // Enrich the raw prompt into a creative brief (audience, tone, goal, key
    // messages) with the SAME agent the project pipeline uses — so /api/generate
    // gets that directive richness instead of a terse prompt → flat script.
    // Best-effort: any failure falls back to the raw prompt, never blocks the job.
    let effectivePrompt = prompt;
    let briefSubject = null;
    let briefObj = null; // retained for the audio-review agent (purpose/emotion)
    {
      const t0 = ms();
      db.setProgress(jobId, "brief");
      try {
        const intent = { prompt, preferences: { duration, orientation, voiceStyle: voice || "auto", framePack: framePack || "auto" } };
        const briefRes = await generateBrief({ intent });
        tracker.addLlm({ inputTokens: briefRes.tokensIn, outputTokens: briefRes.tokensOut, stage: "brief" });
        effectivePrompt = enrichedStoryboardPrompt(briefRes.brief, prompt);
        // Subject anchor for the asset stage's stock queries + vision gate.
        briefSubject = (briefRes.brief && briefRes.brief.subject) ? String(briefRes.brief.subject).trim() : null;
        briefObj = briefRes.brief || null;
        // "Auto" pack: adopt the brief's tone-matched suggestion (an explicit
        // user pack arrived non-null and is honored verbatim). Persist it so
        // the UI/gallery shows the real pack.
        if (!framePack) {
          framePack = frameRegistry.resolvePack(briefRes.brief.suggestedFramePack) || frameRegistry.resolvePack("auto");
          if (framePack) db.setFramePack(jobId, framePack);
          log.info("frame pack (auto) resolved from brief", { framePack });
        }
        markStage("brief", t0);
        log.info("prompt enhanced", { tone: briefRes.brief.tone, goal: briefRes.brief.goal, keyMessages: (briefRes.brief.keyMessages || []).length });
      } catch (e) {
        markStage("brief", t0);
        log.warn("prompt enhancement failed — using raw prompt", { error: String(e.message).slice(0, 160) });
      }
    }
    // Last resort when the brief failed and no pack was chosen: the default.
    if (!framePack) framePack = frameRegistry.resolvePack("auto");

    // ---- Stage: storyboard ----
    {
      const t0 = ms();
      db.setProgress(jobId, "storyboard");
      sbRes = await generateStoryboard({ prompt: effectivePrompt, duration, orientation, framePack });
      tracker.addLlm({ inputTokens: sbRes.tokensIn, outputTokens: sbRes.tokensOut, stage: "storyboard" });
      markStage("storyboard", t0);
      log.info("storyboard ready", { scenes: (sbRes.storyboard.scenes || []).length, title: sbRes.storyboard.title, ms: timings.storyboardMs });
    }

    // ---- Stages: assets + audio prep run IN PARALLEL (both need only storyboard).
    // The audio result is held in a promise used later at mix time. Asset fetch
    // must complete before composer starts (it needs the asset paths), so we
    // await only the assets here — audio keeps cooking in the background.
    db.setProgress(jobId, "assets");
    const audioPromise = wantsAudio
      ? buildAudio({
          jobDir, storyboard: sbRes.storyboard,
          flags: { tts, music, soundEffect, voice }, tracker, perScene: tts, framePack, brief: briefObj,
        }).catch((e) => {
          console.warn(`[pipeline] background audio stage failed: ${e.message}`);
          return { ttsPath: null, musicPath: null, sfx: [], musicVolume: 0.15 };
        })
      : Promise.resolve(null);

    let allAssets = [];
    if (images || video) {
      const t0 = ms();
      const va = await planAndFetchAssets({
        jobId, jobDir, storyboard: sbRes.storyboard,
        flags: { images, video }, orientation, tracker, subject: briefSubject, framePack,
      }).catch((e) => {
        console.warn(`[pipeline] asset stage threw: ${e.message}`);
        return { assets: [] };
      });
      allAssets = va.assets;
      markStage("assets", t0);
      console.log(`[pipeline] assets completed in ${timings.assetsMs}ms (${allAssets.length} fetched; audio running in parallel)`);
    }

    // ---- Per-scene VO + SYNC re-timing (TTS only) ----
    // Synthesize each scene's narration, stretch each scene to fit its line, and
    // pin every clip to its scene's start — audio and video are locked together
    // (replaces the old single VO blob at t=0 that drifted against the cut). Runs
    // BEFORE compose because the composition is built from the re-timed scenes.
    let effectiveDuration = duration;
    let voClips = [];
    if (tts) {
      const t0 = ms();
      // Use the requested voice (or a default) so VO synthesis does NOT block on
      // the audio-plan LLM call — that call can be slow/flaky (KIE 524s) and only
      // feeds music/sfx, which keep cooking in parallel and are awaited at mix time.
      const re = await synthesizeScenedVOAndRetime({
        audioDir: path.join(jobDir, "audio"),
        storyboard: sbRes.storyboard,
        voice: voice || "james",
        instructions: undefined,
        requestedDuration: duration, tracker,
      }).catch((e) => { console.warn(`[pipeline] per-scene VO failed: ${e.message}`); return { voClips: [], effectiveDuration: duration }; });
      voClips = re.voClips;
      effectiveDuration = re.effectiveDuration;
      markStage("vo", t0);
      console.log(`[pipeline] per-scene VO: ${voClips.length} clip(s); re-timed ${duration}s -> ${effectiveDuration}s`);
    }

    const budget = (Number(config.server.stageBudgetSec) || 240) * 1000;

    // Honor USE_LLM_COMPOSER on the direct prompt→video path too — graph.js
    // (langgraph/project pipeline) already maps the flag to `remix`, but runJob
    // previously ignored it, so /api/generate always used the scene-kit. When the
    // flag is on, run the LLM composer here with the scene-kit as the automatic
    // fallback below. An explicit remix arg still wins.
    remix = remix || config.llm.useComposer === true;

    // ---- Attempt 1: PRIMARY composition ----
    // attemptLlmComposition dispatches to the deterministic scene-kit unless
    // `remix: true` (then it runs the LLM composer). Default → guaranteed
    // showcase-grade, per-pack styled, lint-clean.
    {
      const t0 = ms();
      db.setProgress(jobId, "composing");
      try {
        if (render3d && isAssetRich(allAssets)) {
          console.log(`[pipeline] render3d requested, but the video is asset-rich (${allAssets.length} assets) → using the 2D composer so the screenshots/photos are actually shown (3D would drop all but one).`);
        }
        if (render3d && !isAssetRich(allAssets)) {
          // Three.js/WebGL cinematic composition. On failure it falls through to
          // the scene-kit fallback below, so a 3D hiccup never kills the job.
          visualResult = await withBudget(
            (signal) => composeWithThree({
              storyboard: sbRes.storyboard, dims, jobDir, framePack, captionCues: null,
              assets: allAssets, jobId, durationSec: effectiveDuration, label: "three", abortSignal: signal, tracker,
            }),
            budget, "Three.js composition"
          );
          finalAttempt = "three";
          console.log(`[pipeline] Three.js composition+render succeeded in ${ms() - t0}ms`);
        } else {
          // `dress` (premium hybrid): a bounded LLM pass art-directs the scene-kit
          // (per-scene variants, accent word, decorative SVG cluster) without the
          // freehand LLM composer's fragility. remix wins if both are set.
          const useDress = dress && !remix;
          visualResult = await withBudget(
            (signal) => attemptLlmComposition({
              storyboard: sbRes.storyboard, dims, jobDir,
              assets: allAssets, tracker, jobId, durationSec: effectiveDuration,
              label: remix ? "remix" : (useDress ? "premium-dress" : "scene-kit"), abortSignal: signal, framePack, remix,
              dress: useDress, subject: briefSubject,
            }),
            budget, remix ? "LLM remix composition" : (useDress ? "scene-kit + set-dressing" : "scene-kit composition")
          );
          finalAttempt = remix ? "remix" : (useDress ? "scenekit-dressed" : "scenekit");
          console.log(`[pipeline] ${remix ? "LLM remix" : (useDress ? "scene-kit + set-dressing" : "scene-kit")} composition+render succeeded in ${ms() - t0}ms`);
        }
        markStage("compose_render", t0);
      } catch (e1) {
        markStage("compose_render", t0);
        console.warn(`[pipeline] primary compose failed (${e1.message.slice(0, 200)}). Falling back.`);
      }
    }

    // ---- Attempt 2: retry dropping videos (keep images) ----
    if (!visualResult && allAssets.some((a) => a.type === "video")) {
      const imagesOnly = allAssets.filter((a) => a.type === "image");
      const t0 = ms();
      finalAttempt = "no-videos";
      try {
        visualResult = await withBudget(
          (signal) => attemptLlmComposition({
            storyboard: sbRes.storyboard, dims, jobDir,
            assets: imagesOnly, tracker, jobId, durationSec: effectiveDuration,
            label: "no-videos", abortSignal: signal, framePack,
          }),
          budget, "no-videos retry"
        );
        markStage("retry_no_videos", t0);
        console.log(`[pipeline] images-only retry succeeded in ${timings.retry_no_videosMs}ms`);
      } catch (e2) {
        markStage("retry_no_videos", t0);
        console.warn(`[pipeline] images-only retry failed (${e2.message.slice(0, 200)}). Retrying without any assets.`);
      }
    }

    // ---- Attempt 3 REMOVED ----
    // The old no-assets recompose STRIPPED ALL images on any failure and shipped a
    // barren slideshow — the direct cause of "lack of images/assets" videos. It is now
    // redundant: occlusion-exhaustion ships the best asset-ful occlusion-only lap (see
    // composeWithLintRepair), and lint/runtime exhaustion falls to buildFallback below,
    // which KEEPS the photos (assets: allAssets). Images are never stripped to clear overlap.

    // ---- Attempt 4: reliable SCENE-KIT fallback (bland template only if it throws) ----
    // Replaces the old bland deterministic template as the fallback: the scene-kit
    // is showcase-grade and lint-clean by construction, so a failed LLM remix now
    // falls to a GOOD video, not a barren slideshow. The bland buildFallback survives
    // only as a last resort if the scene-kit itself throws (a pathological storyboard).
    if (!visualResult) {
      const t0 = ms();
      try {
        finalAttempt = finalAttempt === "scenekit" ? "scenekit" : "scenekit-fallback";
        visualResult = await composeWithSceneKit({
          storyboard: sbRes.storyboard, dims, jobDir,
          assets: allAssets, framePack, jobId, durationSec: effectiveDuration,
          label: "scene-kit fallback", tracker,
        });
        markStage("fallback_render", t0);
        console.log(`[pipeline] scene-kit fallback rendered in ${timings.fallback_renderMs}ms`);
      } catch (eSk) {
        console.warn(`[pipeline] scene-kit fallback threw (${String(eSk.message).slice(0, 160)}) — bland template last resort.`);
        finalAttempt = "fallback";
        usedFallback = true;
        const fb = buildFallback({
          prompt, duration: effectiveDuration, orientation, width, height, fps,
          storyboard: sbRes.storyboard,
          packTokens: framePack ? require("./frame_registry").getPackTokens(framePack) : null,
          assets: allAssets,
        });
        fs.writeFileSync(path.join(jobDir, "index.html"), fb.indexHtml, "utf8");
        fs.writeFileSync(path.join(jobDir, "meta.json"), fb.metaJson, "utf8");
        tracker.addExternal("hyperframes_render");
        visualResult = await render({ jobId, jobDir, durationSec: effectiveDuration });
        markStage("fallback_render", t0);
        console.log(`[pipeline] polished fallback rendered in ${timings.fallback_renderMs}ms`);
      }
    }

    // ---- Stage: audio mix (audio was prepared in parallel with compose+render)
    if (wantsAudio) {
      const t0 = ms();
      db.setProgress(jobId, "audio");
      try {
        const prepped = await audioPromise;
        // Fold the per-scene VO clips (each tagged kind:"vo" with its scene-start
        // offset) into the sfx list so the mixer lands them at the right time and
        // ducks the music under speech. In perScene mode prepped.ttsPath is null.
        const audio = prepped ? {
          ttsPath: prepped.ttsPath,
          musicPath: prepped.musicPath,
          musicVolume: prepped.musicVolume,
          musicEnvelope: prepped.musicEnvelope,
          ambientPath: prepped.ambientPath,
          ambientVolume: prepped.ambientVolume,
          sfx: [...(prepped.sfx || []), ...voClips],
        } : null;
        const mixed = audio ? await mixAudioIntoVideo({
          visualPath: visualResult.videoPath,
          durationSec: effectiveDuration, audio,
          scenes: sbRes.storyboard.scenes, jobDir,
        }).catch((e) => { console.warn(`[pipeline] mix failed: ${e.message}`); return false; }) : false;
        markStage("audio", t0);
        console.log(`[pipeline] audio ${mixed ? "mixed in" : "(nothing to mix)"} in ${timings.audioMs}ms (was prepared in parallel)`);
        // Audio direction (need/curate/levels) now happens BEFORE fetch+mix in
        // buildAudio via the audio-director agent, so there's no separate post-mix
        // review pass — the director's decision was applied, not just logged.
      } catch (e) {
        markStage("audio", t0);
        console.warn(`[pipeline] audio stage failed: ${e.message}`);
      }
    }

    // ---- Finalize ----
    db.setProgress(jobId, "finalizing");
    const costs = tracker.computeCosts();
    db.markDone(jobId, {
      videoUrl: visualResult.videoUrl,
      usedFallback,
      tokensIn:  costs.llm.inputTokens,
      tokensOut: costs.llm.outputTokens,
      usage:     costs,
      stageTimings: timings,
      finalAttempt,
    });

    log.info("job done", { attempt: finalAttempt, fallback: usedFallback, visuals: allAssets.length, audio: wantsAudio, effectiveDuration, costUsd: costs.totalCostUsd, timings });
  } catch (err) {
    // Something even the polished fallback couldn't handle. Mark failed.
    log.error("job failed fatally", { error: err.message });
    const costs = tracker.computeCosts();
    db.markFailed(
      jobId,
      err.message.slice(0, 2000),
      costs.llm.inputTokens,
      costs.llm.outputTokens,
      costs,
      timings,
    );
  }
}

module.exports = { runJob, withBudget, attemptLlmComposition, composeWithThree, isAssetRich, mixAudioIntoVideo, fallbackQueriesFor };
