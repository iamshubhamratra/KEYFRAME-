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
const sceneAuthor = require("./scene_author");
const fallbackLog = require("./fallback_log");
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
const blueprintComposer = require("./blueprint_composer");
const bloomComposer = require("./bloom_composer");
const bauhausComposer = require("./bauhaus_composer");
const genesisComposer = require("./genesis_composer");
const momentumComposer = require("./momentum_composer");
const showcaseComposer = require("./showcase_composer");
const omeletteAdapter = require("./omelette_adapter");
const posterFamily = require("./family_poster");
const terminalFamily = require("./family_terminal");
const editorialFamily = require("./family_editorial");
const darkFamily = require("./family_darkpremium");
const brightFamily = require("./family_bright");
const cinemaFamily = require("./family_cinema");
const storyFamily = require("./family_story");
const daybreakComposer = require("./daybreak_composer");
const organicComposer = require("./organic_composer");
const lanternComposer = require("./lantern_composer");
const hypeComposer = require("./hype_composer");
const posterpopComposer = require("./posterpop_composer");
const storyblocksComposer = require("./storyblocks_composer");
const premiereComposer = require("./premiere_composer");
const chargedFamily = require("./family_charged");
const { directTemplate } = require("./template_director");
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
const { captureTopicSiteShots } = require("./topic_shots");
const { qaGateScreenshots } = require("./screenshot_qa");
const { checkAssetsRelevance } = require("./asset_vision");
const { reviewAndCurate } = require("./creative_director");
const { styleFor } = require("./pack_style");
const catalog = require("./catalog");
const { contrastCheck } = require("./contrast_check");
const { contrastFix } = require("./contrast_fix");
const { identityFix } = require("./identity_fix");
const { harmonizeBackgrounds } = require("./bg_harmonize");
const { layoutFix } = require("./layout_fix");
const { assembleQualityReport } = require("./quality_report");

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
  const { plan, tokensIn, tokensOut, costUsd, error } = await planAssets(storyboard, {
    images: flags.images, video: flags.video,
  });
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "assets", costUsd: costUsd });

  if (error) {
    console.warn(`[pipeline] asset planner failed (${error}); continuing without visuals`);
    return { assets: [] };
  }

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "assets", "videos"), { recursive: true });

  // TOPIC SCREENSHOTS — real captures of real, on-topic sites. This path serves
  // /api/generate, which has no website of its own, so it previously had NO
  // screenshot capability at all: screenshot_director only fires for jobs
  // carrying a websiteUrl. Stock is at its worst on exactly the technical
  // subjects where a real product page is most convincing, so this runs in
  // PARALLEL with the stock loop below and merges before curation.
  const topicShotTask = (config.topicShots && config.topicShots.enabled === false)
    ? Promise.resolve([])
    : captureTopicSiteShots({
      script: storyboard, jobDir, topic: subject, tracker,
      max: Number(config.topicShots && config.topicShots.max) || 6,
    }).catch(() => []);

  const tasks = [];

  // Shape a planned-but-unfilled slot the way asset_gap_fill expects. The plan
  // item carries its own scene timing, so no storyboard lookup is needed.
  const missFor = (a, kind, type = "image") => ({
    kind,
    scene: { id: a.sceneId, start: a.startSec, duration: a.durationSec, visualDirection: a.alt || a.query },
    need: { type, role: a.style === "inset" ? "inset" : "background" },
    query: a.query,
  });

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
          // A null result is a MISS, not just "no asset": the scene keeps its slot
          // and renders empty. Carry it through so the gap-filler can generate for
          // exactly that slot. (Parity with the agent graph.)
          .then((got) => got ? {
            asset: {
              path: path.relative(jobDir, got.path).split(path.sep).join("/"), type: "image",
              sceneId: a.sceneId, startSec: a.startSec,
              durationSec: a.durationSec, style: a.style, alt: a.alt,
              width: got.width, height: got.height, ratio: got.ratio, hasAlpha: got.hasAlpha, dhash: got.dhash,
              license: got.license, sourceUrl: got.sourceUrl, source: got.source,
            },
          } : { miss: missFor(a, "lookup") })
          .catch(() => ({ miss: missFor(a, "lookup") }))
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
            asset: {
              path: path.relative(jobDir, got.path).split(path.sep).join("/"), type: "video",
              sceneId: a.sceneId, startSec: a.startSec,
              durationSec: a.durationSec, style: a.style,
              license: got.license, sourceUrl: got.sourceUrl, source: got.source,
            },
          } : { miss: missFor(a, "lookup", "video") })
          .catch(() => ({ miss: missFor(a, "lookup", "video") }))
      );
    });
  }

  const settled = (await Promise.all(tasks)).filter(Boolean);
  const results = settled.filter((x) => x.asset).map((x) => x.asset);
  const misses = settled.filter((x) => x.miss).map((x) => x.miss);

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
    if (dup) {
      try { fs.unlinkSync(abs); } catch { /* noop */ }
      // Its only hit was a picture another scene already uses — the slot is still
      // unfilled, which is what makes one photo repeat across the film.
      misses.push(missFor({ sceneId: item.sceneId, startSec: item.startSec, durationSec: item.durationSec, style: item.style, alt: item.alt, query: item.alt }, "duplicate"));
      continue;
    }
    deduped.push(item);
  }

  // IMAGE GAP-FILL — generate for the slots above that came back empty, BEFORE the
  // Creative Director so generated art is reviewed in the same pass as everything
  // else. Off by default; fail-open; hard USD cap per video. Parity with the agent
  // graph (agents/graph.js) — /api/generate lands here, /api/projects lands there.
  // Land the topic captures and vision-gate them exactly like website shots:
  // drop error pages, consent modals, bot-walls and half-renders before anything
  // ranks one as a hero.
  const rawTopicShots = await topicShotTask;
  const topicShots = rawTopicShots.length
    ? await qaGateScreenshots({ assets: rawTopicShots, jobDir, subject, script: storyboard, tracker }).catch(() => rawTopicShots)
    : [];
  if (topicShots.length) {
    // Pinned to their scenes, so they lead rather than compete with stock.
    deduped.unshift(...topicShots);
    console.log(`[pipeline] ${topicShots.length} topic screenshot(s) joined the pool`);
  }

  // AI image generation removed — films use real assets only (stock, website
  // captures, topic screenshots). A slot with nothing to show stays empty rather
  // than being filled with a generated picture.
  const genFills = [];

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
      const topUp = [];
      const finalAssets = curated;
      console.log(`[pipeline] fetched ${results.length}${genFills.length + topUp.length ? ` +${genFills.length + topUp.length} generated` : ""} → ${finalAssets.length} visual asset(s) (dedup + creative director)`);
      return { assets: finalAssets };
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

  console.log(`[pipeline] fetched ${results.length}${genFills.length?` +${genFills.length} generated`:""} → ${survivors.length} visual asset(s) (dedup + vision gate)`);
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

// DETERMINISTIC contrast REPAIR — the "fix" the warn-mode gate never did. Runs
// on EVERY composition path (incl. scene-kit, which never had a contrast gate),
// right before render, on the on-disk index.html: check → surgically recolor the
// offending text to a readable on-palette token (or drop a scrim chip) → re-check,
// up to maxPasses, with NO LLM (ms-cheap string edits). Default ON; disable with
// CONTRAST_FIX=off. Fail-open on any trouble (mirrors contrastGate) — never blocks
// a render. Writes contrast-report.json for the Quality Director to aggregate.
//   CONTRAST_FIX=off/0/false/no → disable
//   (anything else / unset)     → on
function contrastFixMode() {
  const v = String(process.env.CONTRAST_FIX || "").toLowerCase();
  return /^(off|0|false|no)$/.test(v) ? "off" : "on";
}
// Deterministic template-identity remap (phase 2) — snaps off-palette colors to
// the nearest pack token (pure string, no browser; cheap). Runs BEFORE the
// contrast pass so contrast measures the final on-palette colors. Fail-open.
// Writes identity-report.json for the Quality Director. Disable with IDENTITY_FIX=off.
function identityFixMode() {
  const v = String(process.env.IDENTITY_FIX || "").toLowerCase();
  return /^(off|0|false|no)$/.test(v) ? "off" : "on";
}
function identityFixPass(jobDir, { framePack, label = "compose" } = {}) {
  if (identityFixMode() === "off" || !framePack || framePack === "auto") return null;
  const indexPath = path.join(jobDir, "index.html");
  try {
    const packTokens = frameRegistry.getPackTokens(framePack);
    if (!packTokens) return null;
    const html = fs.readFileSync(indexPath, "utf8");
    const out = identityFix(html, packTokens);
    if (out.changed.length) {
      fs.writeFileSync(indexPath, out.html, "utf8");
      console.log(`[pipeline] identity-fix (${label}): remapped ${out.remapped.length} off-palette color(s) — ${out.changed.slice(0, 4).join(" | ")}`);
    }
    try { fs.writeFileSync(path.join(jobDir, "identity-report.json"), JSON.stringify({ remapped: out.remapped }, null, 2)); } catch { /* best-effort */ }
    return out;
  } catch (e) {
    console.warn(`[pipeline] identity-fix (${label}) errored (${String(e.message).slice(0, 120)}) — not blocking`);
    return null;
  }
}

// Deterministic LAYOUT repair — hides duplicate text + scrims text colliding with
// a graphic (SAFE: never moves elements). Renders the comp once. Runs BEFORE the
// contrast loop so contrast measures the post-layout DOM. Disable with LAYOUT_FIX=off.
function layoutFixMode() {
  const v = String(process.env.LAYOUT_FIX || "").toLowerCase();
  return /^(off|0|false|no)$/.test(v) ? "off" : "on";
}
async function layoutFixPass(jobDir, { label = "compose" } = {}) {
  if (layoutFixMode() === "off") return null;
  try {
    const r = await layoutFix(jobDir, { samples: 6, timeoutMs: 50000 });
    if (r.skipped) console.log(`[pipeline] layout-fix skipped (${r.skipped}) (${label})`);
    else if (r.changed && r.changed.length) console.log(`[pipeline] layout-fix (${label}): ${r.duplicatesRemoved} duplicate(s) hidden, ${r.collisionsScrimmed} collision(s) scrimmed — ${r.changed.slice(0, 4).join(" | ")}`);
    // Accumulate across passes (pre-render + any QA contrast_repair re-run).
    let prior = { duplicatesRemoved: 0, collisionsScrimmed: 0 };
    try { prior = JSON.parse(fs.readFileSync(path.join(jobDir, "layout-report.json"), "utf8")); } catch { /* first pass */ }
    const report = {
      duplicatesRemoved: (prior.duplicatesRemoved || 0) + (r.duplicatesRemoved || 0),
      collisionsScrimmed: (prior.collisionsScrimmed || 0) + (r.collisionsScrimmed || 0),
    };
    try { fs.writeFileSync(path.join(jobDir, "layout-report.json"), JSON.stringify(report, null, 2)); } catch { /* best-effort */ }
    // Persist the accumulated totals, but return THIS pass's deltas too so the
    // caller can tell whether the current (e.g. post-QA) run changed anything.
    return { ...report, duplicatesRemovedNow: r.duplicatesRemoved || 0, collisionsScrimmedNow: r.collisionsScrimmed || 0 };
  } catch (e) {
    console.warn(`[pipeline] layout-fix (${label}) errored (${String(e.message).slice(0, 120)}) — not blocking`);
    return null;
  }
}

async function contrastFixPass(jobDir, { framePack, storyboard, dims, label = "compose", maxPasses = 2, escalate = false } = {}) {
  // `escalate` = this is the POST-QA deterministic repair re-pass (QA flagged a
  // blocker the pre-render pass missed): the sub-fixers try HARDER (stronger veils,
  // CSS-background coverage) so the re-pass does real work, not an idempotent no-op.
  let identityRemapped = 0, bgVeiled = 0, layoutChanged = 0;
  // Identity remap first (cheap, pure-string) so the contrast check measures the
  // final on-palette colors. Independent of the CONTRAST_FIX flag.
  try { const idr = identityFixPass(jobDir, { framePack, label }); identityRemapped = (idr && idr.remapped && idr.remapped.length) || 0; } catch { /* fail-open */ }
  // Background harmonize (pure-string): veil any UNSCRIMMED full-bleed background
  // photo to the pack ground, so a raw-colored image can't clash with the design.
  // This is the deterministic fix for the QA "raw background clashing" blocker
  // that previously only got flagged (composer path) — now prevented before QA,
  // and escalated (stronger veil + CSS-bg coverage) when QA still flags it.
  try {
    const idx = path.join(jobDir, "index.html");
    const html = fs.readFileSync(idx, "utf8");
    let th = null; try { th = sceneKit.deriveTheme(framePack, storyboard); } catch { /* defaults */ }
    const out = harmonizeBackgrounds(html, { theme: th, escalate });
    if (out.changed.length) {
      fs.writeFileSync(idx, out.html, "utf8");
      bgVeiled = out.changed.length;
      console.log(`[pipeline] bg-harmonize (${label}${escalate ? " ·escalate" : ""}): grounded ${out.changed.length} background(s) so they match the design`);
    }
  } catch (e) { console.warn(`[pipeline] bg-harmonize (${label}) skipped (${String(e.message).slice(0, 120)})`); }
  // Layout repair next (hide duplicates + scrim collisions) so contrast then
  // verifies the final DOM. Its own render; gated by LAYOUT_FIX.
  try { const lr = await layoutFixPass(jobDir, { label }); layoutChanged = lr ? ((lr.duplicatesRemovedNow || 0) + (lr.collisionsScrimmedNow || 0)) : 0; } catch { /* fail-open */ }
  if (contrastFixMode() === "off") {
    // Contrast loop disabled — but identity/bg/layout already ran above, so still
    // report their deterministic changes (the QA repair node relies on changedAny).
    const changedAny = identityRemapped > 0 || bgVeiled > 0 || layoutChanged > 0;
    return { checked: false, fixed: [], remaining: [], passes: 0, skipped: "off", identityRemapped, bgVeiled, layoutChanged, changedAny };
  }
  const indexPath = path.join(jobDir, "index.html");
  let theme = null, packTokens = null;
  try { theme = sceneKit.deriveTheme(framePack, storyboard); } catch { /* fixer falls back to ground/ink defaults */ }
  try { packTokens = framePack ? frameRegistry.getPackTokens(framePack) : null; } catch { /* optional */ }

  const allFixed = [];
  let remaining = [];
  let passes = 0, checkedAny = false;
  try {
    // p indexes CHECKS: check at each p; fix only if p < maxPasses so the final
    // check always reflects the post-fix state (accurate `remaining`). The healthy
    // case (0 failures) costs exactly ONE check and returns immediately.
    for (let p = 0; p <= maxPasses; p++) {
      let res;
      try { res = await contrastCheck(jobDir, { samples: 5, timeoutMs: 45000 }); }
      catch (e) { console.warn(`[pipeline] contrast-fix check errored (${String(e.message).slice(0, 120)}) — stopping`); break; }
      if (res.skipped) { console.log(`[pipeline] contrast-fix skipped (${res.skipped}) (${label})`); break; }
      checkedAny = true;
      const fails = res.persistentFailures || [];
      remaining = fails;
      if (!fails.length) { if (p > 0) console.log(`[pipeline] contrast-fix (${label}): all text clears WCAG AA after ${p} pass(es)`); break; }
      if (p >= maxPasses) { console.warn(`[pipeline] contrast-fix (${label}): ${fails.length} text element(s) still below AA after ${maxPasses} pass(es) — shipping flagged`); break; }
      let html;
      try { html = fs.readFileSync(indexPath, "utf8"); } catch { break; }
      const out = contrastFix(html, fails, { theme, packTokens, isDark: theme ? theme.isDark : undefined });
      if (!out.changed.length) {
        console.warn(`[pipeline] contrast-fix (${label}): ${fails.length} low-contrast, none deterministically locatable — leaving to QA`);
        break;
      }
      fs.writeFileSync(indexPath, out.html, "utf8");
      allFixed.push(...out.fixed);
      passes = p + 1;
      console.log(`[pipeline] contrast-fix (${label}) pass ${passes}: fixed ${out.fixed.length}/${fails.length} — ${out.changed.slice(0, 4).join(" | ")}`);
    }
  } catch (e) {
    console.warn(`[pipeline] contrast-fix (${label}) errored (${String(e.message).slice(0, 120)}) — not blocking`);
  }
  // ACCUMULATE fixes across passes: this runs both pre-render AND (via the QA
  // contrast_repair node) post-render. The later pass finding nothing must NOT
  // erase the record of what the pre-render pass fixed — otherwise the report card
  // wrongly reads "0 fixed" on a film whose text was actually repaired. Dedup by
  // selector+text+strategy so an idempotent re-fix isn't double-counted.
  let priorFixed = [];
  try { priorFixed = JSON.parse(fs.readFileSync(path.join(jobDir, "contrast-report.json"), "utf8")).fixed || []; } catch { /* first pass */ }
  const seenFix = new Set();
  const mergedFixed = [...priorFixed, ...allFixed].filter((f) => {
    const k = `${f.selector}||${f.text}||${f.strategy}`;
    return seenFix.has(k) ? false : (seenFix.add(k), true);
  });
  const report = {
    checked: checkedAny || priorFixed.length > 0,
    fixed: mergedFixed,
    remaining: remaining.map((r) => ({ selector: r.selector, text: r.text, ratio: r.bestRatio, needed: r.needed })),
    passes,
    // Deterministic changes made by THIS run across the whole chain — the QA repair
    // node re-renders when any of these is non-zero (not only when contrast text was
    // fixed), so a background veil / palette remap / collision scrim also ships.
    identityRemapped, bgVeiled, layoutChanged,
    changedAny: (allFixed.length > 0) || identityRemapped > 0 || bgVeiled > 0 || layoutChanged > 0,
  };
  try { fs.writeFileSync(path.join(jobDir, "contrast-report.json"), JSON.stringify({ ...report, fixed: mergedFixed }, null, 2)); } catch { /* best-effort */ }
  return report;
}

// TEMPLATE IDENTITY gate (identity system) — the LLM remix path receives the
// pack's full design system in the prompt (FRAME.md + palette law) but nothing
// used to VERIFY the output followed it: lint checks structure, inspect checks
// space, contrast checks legibility — none checks that the colors belong to the
// pack or that its display face is present. This gate is deterministic string
// analysis (no browser): every saturated hex in the comp must sit within 40° of
// hue of SOME pack token (lighten/darken keeps hue, so legitimate derivations
// pass; a foreign teal on a coral pack does not), and at least one declared
// pack font family must appear. Same default posture as the contrast gate:
//   IDENTITY_GATE=off   → disabled
//   IDENTITY_GATE=warn  → (default) log violations, never block
//   IDENTITY_GATE=repair→ feed violations back as a repair lap
function identityMode() {
  const v = String(process.env.IDENTITY_GATE || "").toLowerCase();
  if (/^(off|0|false|no)$/.test(v)) return "off";
  if (/^(1|true|yes|on|repair)$/.test(v)) return "repair";
  return "warn";
}
function identityGate(indexHtml, packTokens, label, strict = false) {
  if (identityMode() === "off") return { ok: true };
  const tokens = packTokens && packTokens.colors ? Object.values(packTokens.colors) : [];
  if (!tokens.length) return { ok: true };
  const toRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const toHueSat = ([r, g, b]) => {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
    let h = 0;
    if (d) {
      const [R, G, B] = [r / 255, g / 255, b / 255];
      h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    const sat = mx ? d / mx : 0;
    return { h, sat };
  };
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const packHues = tokens.map((t) => toHueSat(toRgb(t))).filter((x) => x.sat > 0.18).map((x) => x.h);
  if (!packHues.length) return { ok: true }; // monochrome pack: any hue policing would misfire
  const counts = new Map();
  for (const m of indexHtml.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = "#" + m[1].toUpperCase();
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  const offenders = [];
  for (const [hex, n] of counts) {
    const { h, sat } = toHueSat(toRgb(hex));
    if (sat < 0.28) continue; // neutrals / washed tints: scrims, ink, shadows
    if (packHues.every((ph) => hueDist(h, ph) > 40)) offenders.push({ hex, n });
  }
  offenders.sort((a, b) => b.n - a.n);
  const totalOff = offenders.reduce((s, o) => s + o.n, 0);
  const fonts = (packTokens.fonts || []).filter(Boolean);
  const fontMissing = fonts.length > 0 && !fonts.some((f) => indexHtml.includes(f));
  if ((offenders.length === 0 || totalOff < 3) && !fontMissing) {
    console.log(`[pipeline] identity gate: comp stays in the pack's palette family (${label})`);
    return { ok: true };
  }
  const offLines = offenders.slice(0, 8).map((o) => `${o.hex} (×${o.n})`).join(", ");
  const msg = `${offenders.length ? `off-palette colors: ${offLines}` : ""}${offenders.length && fontMissing ? "; " : ""}${fontMissing ? `none of the pack's font families [${fonts.join(", ")}] appear` : ""}`;
  console.warn(`[pipeline] identity gate: ${msg} (${label})${strict ? " [strict: user-pinned template]" : ""}`);
  // strict = the user explicitly picked this template AND asked for the premium
  // composer: identity violations always trigger a repair lap regardless of the
  // env default, so "premium on my template" can't drift off-template.
  if (!strict && identityMode() === "warn") return { ok: true };
  return {
    ok: false,
    identityOnly: true,
    feedback: `Previous HTML passed all structural gates but FAILED the template-identity check — it drifts off the selected pack's design system:\n${msg}\nFIX: replace every off-palette color with the closest color FROM the pack palette (${tokens.join(", ")}), and set headline/display text in the pack's declared font family. Do not invent new hues; derive tints/shades only from the pack's own colors. Keep everything that already passed.`,
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
    // Template-identity gate (LLM path only; scene-kit is identity-faithful by
    // construction) — palette-family + pack-font conformance. Warn-only by
    // default; IDENTITY_GATE=repair feeds violations into a repair lap.
    if (identityMode() !== "off" && enrich && enrich.packTokens) {
      const ig = identityGate(files.indexHtml, enrich.packTokens, label, enrich.strictIdentity === true);
      if (!ig.ok) {
        console.warn(`[pipeline] identity gate FAILED (${label}) — requesting repair`);
        return ig;
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

async function composeWithLintRepair({ storyboard, dims, jobDir, availableAssets, tracker, abortSignal, framePack, captionCues, scriptCues, strictIdentity = false }) {
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
    strictIdentity,
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
    tracker.addLlm({ inputTokens: files.tokensIn, outputTokens: files.tokensOut, stage: "composer", costUsd: files.costUsd });

    const res = await gateComposition({ files, jobDir, tracker, label, enrich, cinematic });
    if (res.ok) return { files };
    // inspectOnly / contrastOnly => lint + runtime PASSED (and spatial inspect too,
    // for contrastOnly); only a residual spatial overlap or a low-contrast label
    // remains. Snapshot the NORMALIZED html (gateComposition mutated it in place) so
    // that on exhaustion we ship this rich comp rather than the bland fallback.
    if ((res.inspectOnly || res.contrastOnly || res.identityOnly) && !bestInspectFiles) {
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

// DEDICATED PACK RENDERERS — a pack can declare a renderer in its manifest
// (pack.json "renderer"): the flagship / Bright Life cinematic Three.js films and
// the blueprint / bloom-fable / bauhaus-riot native GSAP+SVG films. Selecting the
// pack is all it takes: every pipeline path (runJob, graph, project_pipeline)
// funnels through attemptLlmComposition, which routes here REGARDLESS of remix or
// asset-richness — each composer is built to showcase the assets itself. Packs
// without a "renderer" key keep the scene-kit / LLM-remix behavior unchanged.
// `portraitOk`: the composer has real 9:16 layouts (stacked rows, portrait type
// scale). Renderers WITHOUT it are landscape-designed — on a vertical job their
// fixed rows overflow the narrow sheet — so attemptLlmComposition routes those
// jobs to the portrait-tuned scene-kit instead (the pack's manifest styling
// still applies there). Flip a flag to true only after render-verifying that
// composer at 1080x1920.
const PACK_RENDERERS = {
  // All five verified at 1080x1920 via `npm run audit:portrait` (2026-07-17):
  // flagship/brightlife shipped with portrait layouts (Rohit port); blueprint/
  // bloom/bauhaus got portrait type scale + stacked rows the same day.
  // longFormOk: the Three.js renderers fill a 2-3 min film with their own 3D
  // content; the GSAP renderers (blueprint/bloom/bauhaus) draw a few plates then
  // leave the rest of a long film as empty background — so they're routed to
  // scene-kit past LONGFORM_RENDERER_SEC (still styled by the pack, but dense +
  // asset-weaving). NONE of the dedicated renderers weave stock assets, so a
  // long asset-driven film belongs on scene-kit regardless.
  "three-flagship": { label: "flagship", composer: flagshipComposer, desc: "flagship Three.js", portraitOk: true, longFormOk: true },
  "three-brightlife": { label: "brightlife", composer: brightlifeComposer, desc: "Bright Life Three.js", portraitOk: true, longFormOk: true },
  "blueprint": { label: "blueprint", composer: blueprintComposer, desc: "Blueprint Atelier", portraitOk: true, longFormOk: false },
  "bloom-fable": { label: "bloom-fable", composer: bloomComposer, desc: "Bloom Fable", portraitOk: true, longFormOk: false },
  "bauhaus-riot": { label: "bauhaus-riot", composer: bauhausComposer, desc: "Bauhaus Riot", portraitOk: true, longFormOk: false },
  // Genesis — flagship "Living World" cinematic composer. Fills any length with
  // its own animated world + eight beats (longFormOk), recomposes for portrait,
  // and IS brand-adaptive (buildComposition takes brandSkin).
  "genesis": { label: "genesis", composer: genesisComposer, desc: "Genesis living world", portraitOk: true, longFormOk: true },
  // Momentum — faithful port of the momentum-template kinetic launch film (8
  // authored scene types + whip/zoom camera + HUD rail). Maps EVERY storyboard
  // scene to a template scene type and weaves pinned screenshots/photos into
  // its browser/phone/gallery slots, so it fills long films too (longFormOk).
  "momentum": { label: "momentum", composer: momentumComposer, desc: "Momentum kinetic launch", portraitOk: true, longFormOk: true },
  // Showcase — faithful port of the SHOWCASE annotated product-tour template
  // (7 scene types, drawn arrows/callouts, browser + phone frames, blob backdrop).
  // The most screenshot-forward pack: it frames real captures as the product on
  // every media scene, so it pairs directly with topic_shots.js. Maps every
  // storyboard scene to a template scene type and tops its slots up from the
  // asset pool, so it fills long films too (longFormOk).
  // OMELETTE — renders the ORIGINAL bundled template (server/public/omelette-templates)
  // rather than a re-implementation, driving its own frame-exact seek contract.
  // Which template a pack uses comes from its manifest "template" field.
  "omelette": { label: "omelette", composer: omeletteAdapter, desc: "bundled template", portraitOk: true, longFormOk: true },
  "showcase": { label: "showcase", composer: showcaseComposer, desc: "Showcase product tour", portraitOk: true, longFormOk: true },
  // FAMILY templates — one authored scene grammar shared by a visual family,
  // skinned per pack from its own manifest (scene_kit.deriveTheme) so each pack
  // keeps its colours/fonts/text effects while the family owns the staging.
  // Built on template_engine.js, so they inherit the same seek-safe contract,
  // portrait layouts and asset weaving as the hand-written composers.
  "poster-loud": { label: "poster", composer: posterFamily, desc: "Poster-loud family", portraitOk: true, longFormOk: true },
  "retro-terminal": { label: "terminal", composer: terminalFamily, desc: "Retro-terminal family", portraitOk: true, longFormOk: true },
  "editorial-quiet": { label: "editorial", composer: editorialFamily, desc: "Editorial-quiet family", portraitOk: true, longFormOk: true },
  "dark-premium": { label: "dark-premium", composer: darkFamily, desc: "Dark-premium family", portraitOk: true, longFormOk: true },
  "bright-minimal": { label: "bright", composer: brightFamily, desc: "Bright-minimal family", portraitOk: true, longFormOk: true },
  "cinema": { label: "cinema", composer: cinemaFamily, desc: "Cinema family", portraitOk: true, longFormOk: true },
  "story-handmade": { label: "story", composer: storyFamily, desc: "Story-handmade family", portraitOk: true, longFormOk: true },
  "charged": { label: "charged", composer: chargedFamily, desc: "Charged family (per-pack signature FX)", portraitOk: true, longFormOk: true },
  // DEDICATED template ports — the user's bundled "omelette reel" templates,
  // each a faithful per-template port of its source film (its own 6 authored
  // beats, per-beat camera, living world and chrome) on template_engine. These
  // outrank the family grammar for their packs: selecting the template gives
  // THE template, content-swapped (script copy, topical assets, the website
  // screenshot in the film's own media slot).
  "daybreak-bakehouse": { label: "daybreak", composer: daybreakComposer, desc: "Daybreak Bakehouse template", portraitOk: true, longFormOk: true },
  "organic-garden": { label: "organic", composer: organicComposer, desc: "Organic Garden template", portraitOk: true, longFormOk: true },
  "lantern-night": { label: "lantern", composer: lanternComposer, desc: "Lantern Night template", portraitOk: true, longFormOk: true },
  "hype-wave": { label: "hype", composer: hypeComposer, desc: "Hype Wave template", portraitOk: true, longFormOk: true },
  "poster-pop": { label: "posterpop", composer: posterpopComposer, desc: "Poster Pop template", portraitOk: true, longFormOk: true },
  "story-blocks": { label: "storyblocks", composer: storyblocksComposer, desc: "Story Blocks template", portraitOk: true, longFormOk: true },
  "premiere-night": { label: "premiere", composer: premiereComposer, desc: "Premiere Night template", portraitOk: true, longFormOk: true },
};
// Past this length the sparse GSAP dedicated renderers hand off to scene-kit.
const LONGFORM_RENDERER_SEC = 75;

function rendererFor(framePack) {
  if (!framePack) return null;
  try { const m = frameManifest.getManifest(framePack); return (m && m.renderer) || null; }
  catch { return null; }
}

// Shared envelope for every dedicated pack renderer: build → persist → render.
// Self-contained composers (own chrome/3D/vector art), so no enrich and no
// stock-asset weaving. Same seek contract as the scene-kit path.
/**
 * EMPTY-SLIDE GATE. Measures the finished video and reports scenes that render
 * as mostly bare ground.
 *
 * This runs on the OUTPUT because every other gate looks at intent, not result:
 * the structural gates check a clip exists, the media gates check slots are
 * filled, contrast checks that text reads. A scene whose list slot resolved to
 * `[]` passes all of them and still ships a header over a void — which is exactly
 * what reached the user (a Birdsong Gallery whose `shots` rebuilt to an empty
 * array, and a Cadence Board that drew 2 of its 3 columns).
 *
 * Advisory by design: it writes `density-report.json` and warns. It does NOT fail
 * or re-render a film — an empty-looking frame can be deliberate, and a gate that
 * blocks on a judgement call costs more than it saves. Fail-open throughout.
 */
async function densityGate(jobDir, { storyboard, dims, durationSec, label }) {
  try {
    const mp4 = ["final.mp4", "best-lap.mp4", "video.mp4", "out.mp4"]
      .map((f) => path.join(jobDir, f)).find((f) => fs.existsSync(f));
    if (!mp4) return null;
    const { scanFilm } = require("./frame_density");
    const res = await scanFilm(mp4, {
      scenes: (storyboard && storyboard.scenes) || [],
      portrait: !(dims && dims.width >= dims.height),
      durationSec,
    });
    fs.writeFileSync(path.join(jobDir, "density-report.json"), JSON.stringify(res, null, 2), "utf8");
    if (res.findings.length) {
      console.warn(`[pipeline] ${label}: ${res.findings.length} sparse scene(s) —`);
      for (const f of res.findings) console.warn(`[pipeline]   scene ${f.sceneId} @${f.t}s ${f.kind}: ${f.why}`);
    }
    return res;
  } catch (e) {
    console.warn(`[pipeline] density gate skipped: ${String((e && e.message) || e).slice(0, 120)}`);
    return null;
  }
}

/**
 * Decide which scenes the pack cannot show anything new for, and have the agent
 * author those. Returns a Map(sceneIndex -> {html,css,s}), or null.
 *
 * The surplus is measured against the pack's PUBLISHED vocabulary
 * (TEMPLATE_SCENES) — the shapes it can actually draw. Below `minSurplus` the
 * repetition is not yet visible and the LLM call is not worth its cost.
 * Fail-open on every path: an authoring failure must never fail a render.
 */
async function authorSurplusScenes({ R, storyboard, dims, framePack, assets, abortSignal, tracker, label }) {
  const cfg = (config.sceneAuthor || {});
  const on = String(process.env.SCENE_AUTHOR || "").toLowerCase() === "on" || cfg.enabled;
  if (!on) return null;
  try {
    const scenes = (storyboard && storyboard.scenes) || [];
    const shapes = (R.composer.TEMPLATE_SCENES || []).length;
    if (!shapes) return null;                       // pack publishes no vocabulary
    const surplus = scenes.length - shapes;
    if (surplus < (cfg.minSurplus || 2)) return null;

    // Author the TAIL — the pack's own shapes cover the opening, which is where
    // its identity reads strongest; repetition only becomes visible later.
    const cap = cfg.maxScenes || 8;
    const from = Math.max(shapes, scenes.length - cap);
    const marked = scenes.map((s, i) => (i >= from ? { ...s, authorNew: true } : s));
    console.log(`[pipeline] ${label}: ${scenes.length} scenes vs ${shapes} pack shapes — authoring ${scenes.length - from} new scene(s)`);

    let manifest = null;
    try { manifest = require("./frame_manifest").getManifest(framePack); } catch { /* theme is best-effort */ }
    const map = await sceneAuthor.authorScenes({
      scenes: marked, dims, assets, framePack, abortSignal, tracker,
      theme: manifest ? { colors: manifest.colors, fonts: manifest.fonts, textfx: manifest.textfx } : {},
      packStyle: manifest && manifest.description,
    });
    return map && map.size ? map : null;
  } catch (e) {
    console.warn(`[pipeline] scene author skipped: ${String((e && e.message) || e).slice(0, 140)}`);
    return null;
  }
}

async function composeWithPackRenderer({ renderer, storyboard, dims, jobDir, framePack, captionCues, scriptCues, scriptOverlay = false, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, subject = null, fallbackToSceneKit = null }) {
  const t0 = ms();
  const R = PACK_RENDERERS[renderer];
  console.log(`[pipeline] ${label}: building ${R.desc} composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  // TEMPLATE DIRECTOR — a composer that publishes its authored scene vocabulary
  // (TEMPLATE_SCENES) gets an editorial casting pass: every storyboard beat is
  // cast as one of the template's real scenes and its slots filled with the
  // film's own copy + the best-fitting asset. Fail-open: no plan → the composer
  // routes scenes with its own deterministic logic (identical template, less
  // nuanced casting).
  let templatePlan = null;
  if (Array.isArray(R.composer.TEMPLATE_SCENES) && R.composer.TEMPLATE_SCENES.length) {
    try {
      const { plan } = await directTemplate({
        jobId, storyboard, assets, framePack, subject, tracker, signal: abortSignal,
        templateScenes: R.composer.TEMPLATE_SCENES,
      });
      templatePlan = plan;
    } catch (e) {
      console.warn(`[pipeline] template_director skipped: ${String((e && e.message) || e).slice(0, 140)}`);
    }
  }
  // SCENE AUTHOR — when the film has more scenes than the pack has distinct
  // shapes, the surplus would otherwise re-run shapes already seen (a 60s film on
  // a 30s pack looks like its own first half). Those slots get newly authored
  // scenes instead. Every authored scene is lint-gated in scene_author, and any
  // that fails is simply absent from the map, so the pack's own builder remains
  // the floor — this can add variety, never blank a frame.
  const authoredScenes = await authorSurplusScenes({
    R, storyboard, dims, framePack, assets, abortSignal, tracker, label,
  });
  // brandSkin (Art Director / user color) is forwarded — composers that accept it
  // (Genesis, momentum) recolor to the brand; the rest ignore the extra key.
  //
  // SAY SO WHEN IT IS DROPPED. "Ignores the extra key" is silent, and silence is
  // how an agent ends up running, billing, and having no effect on the film for
  // months: the Art Director makes a real LLM call on every website job (site
  // theme-match is on by default), and the bundled-template renderer cannot use
  // its answer at all, because the palette lives inside a compiled React tree.
  // The same is true of the Visual Layout Director's per-scene plan, which reaches
  // only scene-kit — and scene-kit runs for no pack (check:templates: "0 still on
  // scene-kit"). Neither is a crash, so nothing anywhere reported it. Now it does.
  {
    const accepts = String(R.composer.buildComposition || "");
    const dropped = [];
    if (brandSkin && !/\bbrandSkin\b/.test(accepts)) dropped.push("art-director brand skin");
    if (templatePlan && !/\btemplatePlan\b/.test(accepts)) dropped.push("template-director cast");
    if (dropped.length) {
      console.warn(`[pipeline] ${label}: the "${renderer}" renderer cannot consume ${dropped.join(" + ")} — that direction has NO effect on this film`);
    }
  }
  const built = R.composer.buildComposition({ storyboard, dims, framePack, captionCues, scriptCues, scriptOverlay, assets, brandSkin, templatePlan, authoredScenes });
  fs.writeFileSync(path.join(jobDir, "index.html"), built.indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  // RUNTIME SMOKE — ON THIS PATH TOO.
  //
  // runtimeCheck existed and was wired ONLY into the LLM composer branch, so the
  // pack renderers — which are what nearly every job actually uses — had no
  // does-it-actually-run gate at all. A film whose template threw on its sixth
  // scene therefore rendered, encoded, passed lint/contrast/identity/media, and
  // shipped with 14 seconds of error slate; QA's vision pass was the only thing
  // that noticed, after the render was already paid for.
  //
  // A crash here is not a styling nit to be repaired in place — the template
  // cannot draw this content. Fall through to scene-kit, which is deterministic,
  // lint-clean by construction, carries the same pack's styling, and weaves MORE
  // of the asset pool than the template would have. A different-looking film that
  // plays beats a designed one that dies halfway.
  const smoke = await runtimeCheck(jobDir).catch((e) => ({ ok: true, skipped: e.message }));
  if (!smoke.ok) {
    console.warn(`[pipeline] ${label}: pack renderer FAILED runtime smoke — ${smoke.error}`);
    console.warn(`[pipeline] ${label}: falling back to scene-kit with "${framePack}" styling so the film plays end to end`);
    if (typeof fallbackToSceneKit === "function") {
      return fallbackToSceneKit();
    }
  }
  await contrastFixPass(jobDir, { framePack, storyboard, dims, label });
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  await densityGate(jobDir, { storyboard, dims, durationSec, label });
  console.log(`[pipeline] ${label}: render done in ${ms() - t0}ms total`);
  return visual;
}

// `scriptCues` was passed in by every caller and consumed by the LLM-remix branch
// below (composeWithLintRepair) WITHOUT being destructured here — a free variable
// that only a remix job would have reached, and then as a ReferenceError. Named
// explicitly now, alongside the opt-in flag for the full-frame narration layer.
async function attemptLlmComposition({ storyboard, dims, jobDir, assets, tracker, jobId, durationSec, label, abortSignal, framePack, captionCues, scriptCues = null, scriptOverlay = false, remix = false, dress = false, subject = null, brandSkin = null, layoutPlan = null, strictIdentity = false, forceSceneKit = false }) {
  // An explicit PREMIUM finish (remix) means "write me a bespoke composition":
  // it outranks the pack's dedicated renderer — otherwise premium on a
  // dedicated-renderer pack (brightlife/flagship/…) silently rendered the same
  // fixed program as standard and the composer never ran.
  const packRenderer = rendererFor(framePack);
  // `forceSceneKit` is the recovery path for a template that CANNOT draw this
  // content — a compiled component that throws mid-film and paints the engine's
  // error slate over every scene after it. Restyling cannot fix that; only
  // composing again with something that works can, and scene-kit is the composer
  // that cannot throw on a storyboard (deterministic, lint-clean by construction)
  // while keeping the pack's colours, fonts and text effects.
  if (forceSceneKit) {
    console.log(`[pipeline] ${label}: forced scene-kit recompose (the pack renderer produced an unplayable film)`);
    return composeWithSceneKit({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "scene-kit", abortSignal, tracker, dress, subject, brandSkin, layoutPlan });
  }
  if (!remix && PACK_RENDERERS[packRenderer]) {
    const R = PACK_RENDERERS[packRenderer];
    const isPortrait = dims && dims.height > dims.width;
    // A GSAP dedicated renderer past LONGFORM_RENDERER_SEC renders mostly-empty
    // (it draws a handful of plates then leaves the rest blank) — route long jobs
    // to scene-kit, which fills every scene with the pack's styling AND weaves the
    // fetched screenshots/photos/vectors the dedicated renderer would ignore.
    const tooLongForRenderer = !R.longFormOk && durationSec > LONGFORM_RENDERER_SEC;
    if ((!isPortrait || R.portraitOk) && !tooLongForRenderer) {
      return composeWithPackRenderer({
        renderer: packRenderer, storyboard, dims, jobDir, assets, framePack, captionCues, scriptCues, scriptOverlay,
        jobId, durationSec, label: label || R.label, abortSignal, tracker, brandSkin, subject,
        // The escape hatch a failed runtime smoke takes: same pack styling, a
        // composer that cannot throw on this content.
        fallbackToSceneKit: () => composeWithSceneKit({
          storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec,
          label: `${label || R.label}->scene-kit`, abortSignal, tracker, dress, subject, brandSkin, layoutPlan,
        }),
      });
    }
    if (tooLongForRenderer) {
      console.log(`[pipeline] ${R.desc} renders sparse past ${LONGFORM_RENDERER_SEC}s — ${durationSec}s job routes to scene-kit with "${framePack}" styling (dense + asset-weaving)`);
    } else {
      console.log(`[pipeline] ${R.desc} has no portrait layout yet — 9:16 job renders on scene-kit with the "${framePack}" pack styling`);
    }
  }
  // DEFAULT = the deterministic scene-kit (guaranteed showcase-grade, lint-clean,
  // per-pack styled). Every pipeline path (runJob, graph, project_pipeline) routes
  // through here, so this single dispatch makes the kit the primary composer
  // everywhere. The LLM path below runs only on an explicit `remix: true` opt-in.
  // `dress` (premium hybrid): a small bounded LLM pass art-directs the kit's
  // variants/emphasis/decor without any power to break the layout.
  if (!remix) {
    return composeWithSceneKit({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "scene-kit", abortSignal, tracker, dress, subject, brandSkin, layoutPlan });
  }
  const t0 = ms();
  console.log(`[pipeline] ${label}: LLM remix compose start (assets=${assets.length}, framePack=${framePack || "none"})`);
  await composeWithLintRepair({
    storyboard, dims, jobDir, availableAssets: assets, tracker, abortSignal, framePack, captionCues, scriptCues, strictIdentity,
  });
  console.log(`[pipeline] ${label}: compose done in ${ms() - t0}ms, render start`);
  await contrastFixPass(jobDir, { framePack, storyboard, dims, label });
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  await densityGate(jobDir, { storyboard, dims, durationSec, label });
  console.log(`[pipeline] ${label}: render done in ${ms() - t0}ms total`);
  return visual;
}

// PRIMARY composition path — the deterministic SCENE-KIT. Builds a complete,
// showcase-grade, per-pack-styled composition from the storyboard in CODE (no LLM
// freehand → lint-clean by construction, no occlusion/truncation/junk). The agents
// still "think" (they wrote the storyboard + picked the assets); the kit guarantees
// the execution. This is the reliable default; the LLM composer is the opt-in remix.
async function composeWithSceneKit({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label, abortSignal, tracker, dress = false, subject = null, brandSkin = null, layoutPlan = null }) {
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
  const built = sceneKit.buildComposition({ storyboard, dims, framePack, assets: assets || [], captionCues, seedKey: jobId, dressing, brandSkin, layoutPlan });
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
  await contrastFixPass(jobDir, { framePack, storyboard, dims, label: label || "scene-kit" });
  console.log(`[pipeline] ${label || "scene-kit"}: built in ${ms() - t0}ms, render start`);
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  await densityGate(jobDir, { storyboard, dims, durationSec, label });
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
async function composeWithThree({ storyboard, dims, jobDir, framePack, captionCues, scriptCues, assets, jobId, durationSec, label, abortSignal, tracker }) {
  const t0 = ms();
  const { styleName, composer } = pick3dComposer(framePack, storyboard);
  console.log(`[pipeline] ${label || "three"}: building Three.js/WebGL composition (style=${styleName}, ${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = composer.buildComposition({ storyboard, dims, framePack, captionCues, assets });
  fs.writeFileSync(path.join(jobDir, "index.html"), built.indexHtml, "utf8");
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  await contrastFixPass(jobDir, { framePack, storyboard, dims, label: label || "three" });
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  await densityGate(jobDir, { storyboard, dims, durationSec, label });
  console.log(`[pipeline] ${label || "three"}: render done in ${ms() - t0}ms total`);
  return visual;
}

// ========== Per-scene VO + sync re-timing ==========

const r2 = (n) => Math.round(n * 100) / 100;
const clampSceneDur = (n) => Math.max(2, Math.min(15, n));
const VO_TAIL = 0.55; // breathing room after a spoken line finishes

// Shared with graph.js and project_pipeline.js: stretch each storyboard scene
// to contain its MEASURED narration (+VO_TAIL), re-pin every VO clip to its
// scene's new start, and mirror the new timing onto the script's scenes.
// Returns { effectiveDuration, startMap } (old script start -> new start, for
// re-pinning already-scheduled SFX offsets). Idempotent: re-running after a
// repair lap re-derives the same timing.
function retimeScenesToVo(storyboard, script, voClips) {
  const r2b = (n) => Math.round(Number(n) * 100) / 100;
  const sbScenes = (storyboard && Array.isArray(storyboard.scenes)) ? storyboard.scenes : [];
  const clipByScene = new Map((voClips || []).map((c) => [String(c.sceneId), c]));
  let cursor = 0;
  for (let i = 0; i < sbScenes.length; i++) {
    const sc = sbScenes[i];
    const clip = clipByScene.get(String(sc.id != null ? sc.id : `s${i + 1}`));
    const need = clip ? clip.durationSec + VO_TAIL : 0;
    sc.duration = r2b(Math.max(2, Number(sc.duration) || 3, need));
    sc.start = r2b(cursor);
    if (clip) { clip.startSec = sc.start; clip.sceneDurationSec = sc.duration; }
    cursor = r2b(cursor + sc.duration);
  }
  if (sbScenes.length) storyboard.durationSec = r2b(cursor);
  const sbById = new Map(sbScenes.map((sc, i) => [String(sc.id != null ? sc.id : `s${i + 1}`), sc]));
  const startMap = new Map();
  for (const sc of (script && Array.isArray(script.scenes) ? script.scenes : [])) {
    const sb = sbById.get(String(sc.id));
    if (!sb) continue;
    startMap.set(r2b(sc.start), sb.start);
    sc.start = sb.start;
    sc.duration = sb.duration;
  }
  return { effectiveDuration: sbScenes.length ? storyboard.durationSec : 0, startMap };
}

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
  // measured spoken duration we re-time against. One shared ttsSession pins a
  // single provider (= a single narrator voice) across every clip of the job.
  const ttsSession = {};
  const clips = await Promise.all(scenes.map((scene, i) => {
    const text = sceneVOText(scene);
    if (!text) return Promise.resolve(null);
    const targetSec = Math.max(2, Number(scene.duration) || 3);
    return synthesizeFitted({
      text, targetSec, voice, instructions,
      outputPath: path.join(audioDir, `vo-s${i + 1}.mp3`), tracker, session: ttsSession,
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
  const { plan, tokensIn, tokensOut, costUsd, error: planErr } = await planAudio(storyboard, flags, packAudio);
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "audio", costUsd: costUsd });

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

async function runJobInner({
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
        tracker.addLlm({ inputTokens: briefRes.tokensIn, outputTokens: briefRes.tokensOut, stage: "brief", costUsd: briefRes.costUsd });
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
      tracker.addLlm({ inputTokens: sbRes.tokensIn, outputTokens: sbRes.tokensOut, stage: "storyboard", costUsd: sbRes.costUsd });
      markStage("storyboard", t0);
      log.info("storyboard ready", { scenes: (sbRes.storyboard.scenes || []).length, title: sbRes.storyboard.title, ms: timings.storyboardMs });
    }

    // ---- Text Director (path-unification #1) ----
    // The LangGraph path runs text_director as a node; the single-shot path skipped
    // it, so /generate films had emptier/boilerplate on-screen copy than /projects.
    // Mine the script's own lines into empty subtext/bullet slots BEFORE assets/audio/
    // compose read the storyboard. Enriches sbRes.storyboard IN PLACE. The miner is
    // free + additive (only fills empty slots); the LLM pass is opt-in via its config.
    // Fail-open: any failure leaves the storyboard exactly as generated.
    try {
      const { directText } = require("./text_director");
      await directText({ jobId, brief: effectivePrompt, script: sbRes.storyboard, storyboard: sbRes.storyboard, tracker });
    } catch (e) { console.warn(`[pipeline] text_director skipped: ${String((e && e.message) || e).slice(0, 120)}`); }

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
    let layoutPlan = null;   // visual_layout_director output (path-unification #1); threaded into compose below
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
      // Asset Director (path-unification #1) — the SAME per-asset craft review
      // (kind/fit/focus/effect/quality) the LangGraph path runs, via the shared
      // directAssets helper, so /generate assets are fit-corrected + quality-gated
      // like /projects (was skipped here → wrong crops + weak assets in slots).
      // Fail-open + skips if a creative-director craft pass already tagged them.
      try {
        const { directAssets } = require("./asset_director");
        await directAssets({ assets: allAssets, jobDir, subject: briefSubject, tracker });
      } catch (e) { console.warn(`[pipeline] asset_director skipped: ${String((e && e.message) || e).slice(0, 120)}`); }
      // Visual Layout Director (path-unification #1) — deterministic (no LLM/IO)
      // composition-presentation pass the LangGraph path runs: re-levels prominent
      // asset overflow to scrim B-roll, sets content-aware cropFocus + phone/browser
      // container, and produces a layoutPlan (per-scene archetype + heroScale/
      // montageMax) that scene-kit reads. Runs AFTER directAssets so a.focus/a.fit
      // win, and BEFORE db.setAssets so the demotions persist. Fail-open.
      try {
        const { directLayout } = require("./visual_layout_director");
        const vld = directLayout({ storyboard: sbRes.storyboard, script: sbRes.storyboard, assets: allAssets, framePack, dims });
        layoutPlan = vld.layoutPlan || null;
        allAssets = vld.assets || allAssets;
        if (vld.review) { try { db.setLayoutReview(jobId, vld.review); } catch { /* best effort */ } }
      } catch (e) { console.warn(`[pipeline] visual_layout_director skipped: ${String((e && e.message) || e).slice(0, 120)}`); }
      // Persist the curated list like the agent-graph path does — without this,
      // /generate jobs show 0 assets in jobs.json and the only audit trail is a
      // job dir the janitor deletes after an hour.
      try { db.setAssets(jobId, allAssets); } catch { /* best effort */ }
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
    // An EXPLICIT premium ask (remix arg from composeMode:"premium") is the
    // user's word — it always runs the composer. The config default only
    // upgrades jobs that didn't state a preference.
    const explicitPremium = remix === true;
    remix = remix || config.llm.useComposer === true;

    // TEMPLATE PIN (identity system) — an EXPLICIT gallery pick must render the
    // picked template faithfully, so a pinned pack demotes the CONFIG-DEFAULT
    // composer to scene-kit / dedicated renderer. An explicit premium finish is
    // no longer demoted: the composer writes a bespoke page from the pack's
    // FRAME.md and the identity gate runs in STRICT mode (violations force a
    // repair lap), so "premium on my template" stays on-template.
    const jobRec = db.getRaw(jobId);
    const packPinned = !!(jobRec && (jobRec.frame_pack_user === 1 || jobRec.frame_pack_user === true));
    if (packPinned && remix && !explicitPremium) {
      console.log(`[pipeline] frame pack "${framePack}" was explicitly picked — pinning to the deterministic composer (config-default LLM remix skipped)`);
      remix = false;
    } else if (packPinned && explicitPremium) {
      console.log(`[pipeline] premium finish on user-pinned pack "${framePack}" — LLM composer runs with STRICT identity gate`);
    }
    const strictIdentity = packPinned && remix;

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
              dress: useDress, subject: briefSubject, strictIdentity, layoutPlan,
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

    // ---- Stage: visual QA (verify-by-default) + bounded deterministic repair ----
    // The single-shot path shipped with NO post-render check — the reel crop, empty
    // plates and density gaps all reached users this way. Port the LangGraph path's
    // reviewRender gate: sample rendered frames, vision-check for HARD defects
    // (blank/unreadable/clipped/cropped), and if any are found run the deterministic
    // fix chain + re-render ONCE, BEFORE the audio is mixed in. Config-gated
    // (config.qa.enabled=false disables); fail-open (any error ships the render).
    let qaVerdict = null;
    if (config.qa?.enabled !== false && !usedFallback && visualResult && visualResult.videoPath) {
      const t0 = ms();
      db.setProgress(jobId, "qa");
      const { reviewRender } = require("../agents/qa_agent");
      const qaArgs = {
        scenes: sbRes.storyboard.scenes, duration: effectiveDuration, framePack,
        workDir: path.join(jobDir, "qa"), tracker, dims: { width, height },
        // scene-kit / dedicated renders judge only HARD defects (their typographic
        // design language is intentional); an LLM remix is held to the full bar.
        deterministic: finalAttempt !== "remix",
      };
      try {
        qaVerdict = await reviewRender({ ...qaArgs, videoPath: visualResult.videoPath })
          .catch((e) => { console.warn(`[pipeline] qa failed (${String(e.message).slice(0, 120)}); passing`); return { pass: true, issues: [], error: e.message }; });
        const blockers = (qaVerdict.issues || []).filter((x) => x && x.severity === "blocker");
        if (!qaVerdict.pass && blockers.length) {
          console.log(`[pipeline] qa: ${blockers.length} blocker(s) — deterministic repair + re-render`);
          const rep = await contrastFixPass(jobDir, {
            framePack, storyboard: sbRes.storyboard, dims: { width, height }, label: "qa-repair", escalate: true,
          }).catch((e) => { console.warn(`[pipeline] qa-repair errored: ${e.message.slice(0, 120)}`); return null; });
          if (rep && rep.changedAny) {
            tracker.addExternal("hyperframes_render");
            visualResult = await render({ jobId, jobDir, durationSec: effectiveDuration });
            qaVerdict = await reviewRender({ ...qaArgs, videoPath: visualResult.videoPath })
              .catch((e) => { console.warn(`[pipeline] re-qa failed (${String(e.message).slice(0, 120)})`); return qaVerdict; });
          } else {
            console.log(`[pipeline] qa: no deterministically fixable blocker — shipping with verdict recorded`);
          }
        }
        markStage("qa", t0);
        console.log(`[pipeline] qa: ${qaVerdict.pass ? "pass" : "fail"} score=${qaVerdict.score != null ? qaVerdict.score : "?"} in ${timings.qaMs}ms`);
      } catch (e) {
        markStage("qa", t0);
        console.warn(`[pipeline] qa stage failed: ${e.message}`);
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

    // Quality Director summary. The single-shot path now runs a post-render visual
    // QA lap (qaVerdict above), so the report surfaces the real vision verdict
    // alongside contrast fixes, audio loudness, screenshot QA and asset/template
    // scores. Falls back to any stored qa / null. Never throws.
    try {
      const raw = db.getRaw(jobId);
      db.setQualityReport(jobId, assembleQualityReport({
        jobDir: jobDirFor(jobId), qa: qaVerdict || (raw && raw.qa) || null, creativeReview: raw && raw.creative_review,
      }));
    } catch (e) { log.warn?.("quality report failed", { error: e.message }); }

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

/**
 * Every job runs inside a fallback tally. Anything the pipeline awaits — however
 * deep — can call `note()` without being handed a recorder, and each concurrent
 * job keeps its own count (AsyncLocalStorage, not a module global). The report
 * lands next to the film as `fallbacks.json`, so "this film substituted 14 times"
 * becomes a fact you can read instead of something you have to watch for.
 */
async function runJob(opts) {
  return fallbackLog.runWithLog(opts && opts.jobId, async () => {
    try {
      return await runJobInner(opts);
    } finally {
      // In `finally` so a FAILED job still reports what it had to substitute —
      // that is exactly the run where the tally is most worth reading.
      try { fallbackLog.writeReport(jobDirFor(opts.jobId), opts.jobId); } catch { /* never mask the real result */ }
    }
  });
}

module.exports = {
  retimeScenesToVo, runJob, withBudget, attemptLlmComposition, composeWithThree, isAssetRich, mixAudioIntoVideo, fallbackQueriesFor,
  identityGate, contrastFixPass };
