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
const blueprintComposer = require("./blueprint_composer");
const bloomComposer = require("./bloom_composer");
const bauhausComposer = require("./bauhaus_composer");
const terminalComposer = require("./terminal_departures_composer");
const paperTalesComposer = require("./paper_tales_composer");
// Imported portrait packs — native GSAP composers, all sharing one contract
// ({ buildComposition, STRINGS }). Table-dispatched below so one generic wrapper
// routes all of them (no per-renderer branch/wrapper explosion), and composerStringsFor
// picks up their localizable STRINGS automatically.
const NATIVE_PACK_COMPOSERS = {
  // Prisma Bloc — flat colour-blocked poster-in-motion (DOM + GSAP, no WebGL).
  "dom-prisma": require("./prisma_composer"),
  // The seven imported "Animated video template" packs. They are one film built seven
  // ways (same six beats, same progress contract, same media slots), so they share ONE
  // engine — services/om_stage.js — and ship only a ~200-line skin each.
  "om-garden": require("./om_skins/organic_garden"),
  "om-lantern": require("./om_skins/lantern_night"),
  "om-bakehouse": require("./om_skins/daybreak_bakehouse"),
  "om-blocks": require("./om_skins/story_blocks"),
  "om-poster": require("./om_skins/poster_pop"),
  "om-premiere": require("./om_skins/premiere_night"),
  "om-hype": require("./om_skins/hype_wave"),
  "motion-canvas": require("./motion_canvas_composer"),
  "paper-craft": require("./paper_craft_composer"),
  // Grid Dispatch — a Swiss-modernist "dispatch sheet in motion" ported from an imported
  // OM/Modernist template. Table-dispatched like the rest, which also hands it
  // composerStringsFor + composerModuleFor (and therefore the portrait regression guard)
  // for free — one map entry instead of a bespoke branch, wrapper and STRINGS line.
  "grid-dispatch": require("./grid_dispatch_composer"),
  // Slab Stage — grid-dispatch's sibling from the same import, and deliberately its
  // opposite: dimensional rather than flat, two accents rather than mono, and a camera that
  // never settles rather than one that settles before every cut.
  "slab-stage": require("./slab_stage_composer"),
  // The imported OM ports built on om_port_kit. Each supplies a theme, its STRINGS and its
  // scene builders; the kit supplies the shell, the camera, the caption node, role assignment,
  // slot filling and the pictureless STATEMENT fallback.
  // KINETIC BOLD — not a port: written from its own manifest, because the pack shipped with no
  // renderer at all and every film that chose it rendered through the generic kit.
  "kinetic-bold": require("./kinetic_bold_composer"),
  // MONO CORPORATE — likewise written from its own manifest, not ported: the second of the ten packs
  // scripts/test-pack-composers.js found rendering as the generic kit.
  "mono-corporate": require("./mono_corporate_composer"),
  "aurora-spectrum": require("./aurora_spectrum_composer"),
  "fable-storybook": require("./fable_storybook_composer"),
  "midnight-glass": require("./midnight_glass_composer"),
  "noir-spotlight": require("./noir_spotlight_composer"),
  "vapor-chrome": require("./vapor_chrome_composer"),
  "bauhaus-print": require("./bauhaus_print_composer"),
  "biennale-yellow": require("./biennale_yellow_composer"),
  "blockframe": require("./blockframe_composer"),
  "bloom-illustrated": require("./bloom_illustrated_composer"),
  "hacker": require("./hacker_composer"),
  "teampulse": require("./teampulse_composer"),
  "fetch": require("./fetch_composer"),
  "drive": require("./drive_composer"),
  "jungle": require("./jungle_composer"),
  "deep": require("./deep_composer"),
  "momentum": require("./momentum_composer"),
  "pipeline": require("./pipeline_composer"),
  "flight-vertical": require("./flight_vertical_composer"),
  "flight": require("./flight_composer"),
  "showcase-vertical": require("./showcase_vertical_composer"),
  "reel": require("./reel_composer"),
  "fight": require("./fight_composer"),
  "edition": require("./edition_composer"),
  "orbit": require("./orbit_composer"),
  // Showcase — the library's first LANDSCAPE-authored native pack, and its most
  // screenshot-hungry: an annotated product tour in real device chrome, with drawn arrows,
  // numbered callouts and a travelling cursor. Ported from the same imported OM set.
  "showcase": require("./showcase_composer"),
  // The 70 imported FilmKit packs — the same story as the seven OM skins above, one scale
  // up. They are one film built seventy ways (the handoff's source/film-kit.js), so they
  // share ONE engine — services/film_stage.js — and each ships a generated skin under
  // film_skins/. Registered by directory scan rather than seventy literal lines, so
  // `node scripts/gen-film-skins.js` adding a template is all it takes to install it.
  ...filmSkinComposers(),
};

// Every generated FilmKit skin, keyed by its renderer id ("film-<slug>", which is what the
// pack's own frames/<slug>/pack.json declares). FAIL-OPEN PER SKIN: one bad module must cost
// its own pack, never the boot — this map is built at require time and a throw here would
// take the whole server down before it could serve a single job.
function filmSkinComposers() {
  const out = {};
  const dir = path.join(__dirname, "film_skins");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && !f.startsWith("_")); }
  catch { return out; }
  for (const f of files) {
    const slug = f.replace(/\.js$/, "").replace(/_/g, "-");
    try {
      const m = require(path.join(dir, f));
      if (m && typeof m.buildComposition === "function") out[`film-${slug}`] = m;
      else console.warn(`[composer] film_skins/${f} exports no buildComposition — skipped`);
    } catch (e) {
      console.warn(`[composer] film_skins/${f} failed to load (${e.message.slice(0, 120)}) — skipped`);
    }
  }
  return out;
}

// THE AUTHORITATIVE renderer -> composer module map. Every pack that owns a dedicated
// composer appears here exactly once: the seven that attemptLlmComposition dispatches
// through their own branch (they take different argument shapes, so the branches stay)
// plus the table-dispatched natives above.
//
// WHY IT EXISTS. Tooling used to re-derive this by GUESSING a filename from the renderer
// id (`"om-garden"` -> `om_garden_composer.js`). Nothing enforced that guess, and it is
// wrong for every pack whose module does not happen to be named that way — the seven OM
// skins live in `om_skins/`, and prisma-bloc's renderer is "dom-prisma" but its module is
// `prisma_composer.js`. scripts/test-portrait-assets.js took that miss as "no dedicated
// composer — routes to scene-kit" and SKIPPED them, so the regression guard that is
// supposed to prove every portrait template renders assets was silently blind to 8 of the
// 22 portrait packs (36%), the entire OM family included. A filename convention is not a
// contract; this table is. Resolve through composerModuleFor(), never by filename.
const DEDICATED_COMPOSERS = {
  "three-flagship": flagshipComposer,
  "three-brightlife": brightlifeComposer,
  blueprint: blueprintComposer,
  "bloom-fable": bloomComposer,
  "bauhaus-riot": bauhausComposer,
  "terminal-departures": terminalComposer,
  "paper-tales": paperTalesComposer,
  ...NATIVE_PACK_COMPOSERS,
};

// The composer module a renderer id routes to, or null when the pack has none (it then
// falls through to the deterministic scene-kit). The single resolver for dispatch-adjacent
// tooling: harnesses, pack scaffolding, and the portrait regression guard.
// NODE CACHES A COMPOSER MODULE AT BOOT, and a long-lived server therefore keeps rendering the
// version it loaded no matter what is on disk. That has now cost real jobs more than once: a
// composer was rebuilt at 12:18, a job ran at 12:30, and it rendered the pre-rebuild film
// because the server had been up since 11:38. The failure is silent — the output is a
// plausible-looking video of the WRONG design, so nothing errors and nothing looks broken.
//
// So dispatch re-checks the file's mtime and reloads it when it has changed. Composers are pure
// (they export buildComposition and hold no state), which is what makes this safe. Fail-open, as
// everywhere else in this file: a reload that throws leaves the already-loaded module in place
// and never blocks a render.
const COMPOSER_LOADED_AT = new Map();
function composerFileOf(mod) {
  for (const [file, m] of Object.entries(require.cache)) if (m && m.exports === mod) return file;
  return null;
}
function composerModuleFor(renderer) {
  const key = String(renderer || "");
  let m = DEDICATED_COMPOSERS[key];
  if (!m) return null;
  try {
    const file = composerFileOf(m);
    if (file) {
      const mtime = fs.statSync(file).mtimeMs;
      const known = COMPOSER_LOADED_AT.get(file);
      if (known === undefined) COMPOSER_LOADED_AT.set(file, mtime);
      else if (mtime > known) {
        delete require.cache[file];
        const fresh = require(file);
        if (fresh && typeof fresh.buildComposition === "function") { DEDICATED_COMPOSERS[key] = fresh; m = fresh; }
        COMPOSER_LOADED_AT.set(file, mtime);
        console.warn(`[composer] ${path.basename(file)} changed on disk — reloaded (was serving the boot-time copy)`);
      }
    }
  } catch { /* fail-open: keep the loaded module */ }
  return m && typeof m.buildComposition === "function" ? m : null;
}

const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");
const { injectCaptionStyle, hasCaptionTarget } = require("./caption_render");
const { auditAssetRender, isAssetRenderFailure } = require("./asset_render_check");

// Pre-render asset-placement disclosure. Reconciles the assets a native composer RECEIVED
// against what its composed HTML actually RENDERS (real <img> refs, per-scene spread), logs
// the debug report, and SHOUTS when assets were collected but the film is text-only / broken
// — so a regression is surfaced with a clear diagnostic instead of shipping a generic video.
// Fail-open (THE LAW): never throws, never blocks the render. Returns the report (or null).
function discloseAssetRender(jobDir, indexHtml, assets, label) {
  try {
    const report = auditAssetRender({ indexHtml, assets, jobDir });
    if (report && report.assetsCollected > 0) {
      const line = `[asset-check] ${label}: ${report.assetsRendered}/${report.assetsCollected} asset(s) rendered · ${report.scenesWithAsset}/${report.sceneCount} scenes show one · status=${report.renderStatus}`;
      if (isAssetRenderFailure(report)) console.warn(`⚠ ${line} — ASSETS COLLECTED BUT NONE REACHED THE FILM. report=${JSON.stringify(report)}`);
      else console.log(line);
    }
    return report;
  } catch { return null; }
}

// Write the composed index.html, first injecting the caption language font +
// text-direction override (multi-language captions). A null/Latin captionStyle
// is a no-op, so English output is byte-identical to before. This is the single
// choke point that makes burned-in captions render correctly in ANY language
// without editing the individual composers.
function writeIndexHtml(jobDir, html, captionStyle) {
  fs.writeFileSync(path.join(jobDir, "index.html"), injectCaptionStyle(html, captionStyle), "utf8");
}

// A pack can declare a dedicated renderer in its manifest (pack.json "renderer").
// The flagship pack ("three-flagship") routes to the flagship Three.js composer.
function rendererFor(framePack) {
  if (!framePack) return null;
  try { const m = frameManifest.getManifest(framePack); return (m && m.renderer) || null; }
  catch { return null; }
}

// The FIXED English strings (KICK kickers, fallback CTAs) a pack's composer bakes in —
// exported per composer as `STRINGS`. Used by the Localization Director to translate them
// alongside the storyboard text. Returns null for packs whose text is canvas/charset
// (three-*/terminal-departures) and thus not DOM-localizable, or when the composer has no
// STRINGS (fold degrades to a no-op).
function composerStringsFor(framePack) {
  const r = rendererFor(framePack);
  if (!r) return sceneKit.STRINGS || null; // default / non-dedicated pack → scene-kit
  const map = {
    blueprint: blueprintComposer.STRINGS,
    "bloom-fable": bloomComposer.STRINGS,
    "bauhaus-riot": bauhausComposer.STRINGS,
    "paper-tales": paperTalesComposer.STRINGS,
    // All imported OM portrait packs are DOM-text (GSAP/CSS), so their STRINGS are localizable.
    ...Object.fromEntries(Object.entries(NATIVE_PACK_COMPOSERS).map(([k, m]) => [k, m.STRINGS])),
  };
  if (Object.prototype.hasOwnProperty.call(map, r)) return map[r] || null;
  return null; // canvas/charset packs: nothing DOM-localizable
}

// A pack is "flat" (solid grounds, no gradients/glows — blockframe, biennale,
// editorial packs) when its manifest says so, or it's in scene-kit's FLAT_PACKS
// set. Flat packs skip the generic gradient/particle enrichment that would erase
// their identity (see enrich.js).
function isFlatPack(framePack) {
  if (!framePack) return false;
  try {
    const m = frameManifest.getManifest(framePack);
    if (m && m.surface && typeof m.surface.flat === "boolean") return m.surface.flat;
  } catch { /* fall through */ }
  return !!(sceneKit.FLAT_PACKS && sceneKit.FLAT_PACKS.has && sceneKit.FLAT_PACKS.has(framePack));
}
const { render } = require("./renderer");
const { buildFallback } = require("./fallback");
const { planAudio } = require("./audio_planner");
const { synthesize: ttsSynthesize } = require("./tts");
const { synthesizeFitted } = require("./vo_fit");
const { fetchMusic } = require("./audio_sources");
const { getSfx } = require("./sfx_library");
const { resolveIntent } = require("./audio_cues");
const audioProfileSvc = require("./audio_profile");
const { mix: audioMix } = require("./audio_mix");
const { planAssets } = require("./asset_planner");
const { acquire, makeImageDeduper } = require("./asset_sources");
const { checkAssetsRelevance } = require("./asset_vision");
const { reviewAndCurate } = require("./creative_director");
const { directAudio } = require("./audio_director");
const { defaultBrandSkin } = require("./art_director");
const { coverageFromUsed, shouldRepair } = require("./asset_coverage");
const { styleFor } = require("./pack_style");
const catalog = require("./catalog");
const { contrastCheck } = require("./contrast_check");

function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }
function ms() { return Date.now(); }

// Mechanical fallback queries so a too-specific search degrades to a broader one instead of
// failing.
//
// This used to be "drop the last word, then keep the first two", which works for a 3-4 word
// query and fails badly for a described SCENE. Asset needs are now written as shootable
// sentences ("hand holding smartphone photographing a paper receipt on a café table"), and
// that rule degraded it to "…on a café" and then to "hand holding" — the second of which is
// not a search for anything.
//
// A stock search wants CONTENT NOUNS. So the ladder drops the function words first and keeps
// the most meaningful head of the phrase: four content words, then three, then two.
const QUERY_STOP = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "with", "from", "into",
  "over", "under", "onto", "by", "as", "is", "are", "its", "his", "her", "their", "while",
  "that", "this", "it", "up", "down", "out",
]);
function fallbackQueriesFor(query) {
  const raw = String(query).trim().split(/\s+/).filter(Boolean);
  const content = raw.filter((w) => !QUERY_STOP.has(w.toLowerCase()));
  const out = [];
  if (raw.length >= 3) out.push(raw.slice(0, -1).join(" "));
  // The content-word head: the part a stock library actually indexes.
  for (const n of [4, 3, 2]) {
    if (content.length > n) out.push(content.slice(0, n).join(" "));
  }
  if (content.length >= 2 && content.length <= 4) out.push(content.join(" "));
  return [...new Set(out)].filter((q) => q && q !== query);
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

async function planAndFetchAssets({ jobDir, storyboard, flags, orientation, tracker, subject, framePack }) {
  if (!flags.images && !flags.video) return { assets: [] };

  const packStyle = styleFor(framePack);
  const { plan, tokensIn, tokensOut, model: servedModel, provider: servedBy, error } = await planAssets(storyboard, {
    images: flags.images, video: flags.video,
  });
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "assets", model: servedModel, provider: servedBy });

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
      // Anchor to the film's subject (on-topic stock). Pack style is applied at
      // RANK time (styleKeywords) and render time (treatment) — not concatenated
      // into the search text, which overflowed provider length limits.
      const q = subject ? `${subject} ${a.query}` : a.query;
      tasks.push(
        acquire({
          query: q,
          fallbackQueries: [...new Set([a.query, ...fallbackQueriesFor(q)])],
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

  // VISION RELEVANCE GATE (batched) — gate ONLY real web stock; curated picks
  // carry no provider source and stay trusted. One batched call (chunks of 6),
  // fail-open. Brings /api/generate to the agent graph's asset-quality bar.
  //
  // SUPERSEDED by the Creative Director agent when enabled: the CD runs a richer
  // review (scores + scene assignment + prominence) on ALL assets after this
  // stage, so we skip this simpler keep/reject gate to avoid double vision cost.
  // Kept as the fallback when CREATIVE_DIRECTOR=0.
  const PROVIDER_SOURCES = new Set(["pixabay", "openverse", "pexels", "pixabay_scrape"]);
  let survivors = deduped;
  const webStock = deduped.filter((it) => PROVIDER_SOURCES.has(it.source));
  if (!config.creativeDirector.enabled && subject && webStock.length) {
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

  const gateLabel = config.creativeDirector.enabled ? "dedup; creative-director review next" : "dedup + vision gate";
  console.log(`[pipeline] fetched ${results.length} → ${survivors.length} visual asset(s) (${gateLabel})`);
  return { assets: survivors };
}

// ========== Composition + lint repair ==========

// OPT-IN legibility gate for the LLM-composer path. Default OFF: the deterministic
// scene-kit is contrast-clean by construction, and a second headless pass per lap
// isn't worth the memory there. On the LLM (remix) path colors are model-chosen, so
// this catches the readability dimension lint (time) and inspect (space) can't.
//   CONTRAST_GATE=warn    → run + log low-contrast text, never block
//   CONTRAST_GATE=repair  → (also 1/on/true/yes) feed it back as a soft repair
//                            signal; on exhaustion the comp still ships (see below)
function contrastMode() {
  const v = String(process.env.CONTRAST_GATE || "").toLowerCase();
  if (v === "warn") return "warn";
  if (/^(1|true|yes|on|repair)$/.test(v)) return "repair";
  return "off";
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
    flat: isFlatPack(framePack),
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
    tracker.addLlm({ inputTokens: files.tokensIn, outputTokens: files.tokensOut, stage: "composer", model: files.model, provider: files.provider });

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

async function attemptLlmComposition({ storyboard, dims, jobDir, assets, tracker, jobId, durationSec, label, abortSignal, framePack, captionCues, remix = false, dress = false, subject = null, brandSkin = null, layoutPlan = null, captionStyle = null, localized = null, motionPlan = null }) {
  // `brandSkin` (Art Director) rides along to EVERY composer below, not just the
  // scene-kit. It is hue-only — accents/emphasis/glow — and carries no authority over
  // a pack's ground, ink, type, motion, layout, or semantic colors (terminal's
  // green=ON-TIME, blueprint's cyan=dimension lines): those ARE the pack's identity.
  // A composer is free to ignore it, and a null skin must render byte-identically.
  // `layoutPlan` stays scene-kit-only by contract — its archetype vocabulary mirrors
  // scene_kit.archetypeFor and its reserved __heroScale/__montageMax globals are
  // calibrated to the kit's slots; the dedicated renderers own their own scene-types.
  // (The Layout Director's asset reduction/crop work already reaches them: it mutates
  // the shared `assets` array in place.)
  //
  // The skin makes the RETURN trip too. A composer that reconciles the brand against
  // its own ground hands back `resolvedBrand` (the PackSkin it actually wore), every
  // composeWith* below forwards it onto the object it returns, and the caller that
  // knows the job — graph.compositionAgent — persists it. That trip is the whole
  // difference between the Brand panel showing the color the user PICKED and the color
  // that SURVIVED: a mid-dark brand blue on a near-black stage is lifted to clear the
  // ground, and only the composer knows by how much. A composer that ignores the skin
  // simply has no `resolvedBrand`; that reads as null and leaves the panel EMPTY, which
  // is the honest answer for a film that paints no brand color at all.
  //
  // FLAGSHIP TEMPLATE — a pack whose manifest declares renderer:"three-flagship"
  // routes to the dedicated cinematic Three.js composer, REGARDLESS of remix or
  // asset-richness (it is built to showcase the assets in 3D). Every pipeline path
  // funnels through here, so selecting the flagship pack is all it takes.
  if (rendererFor(framePack) === "three-flagship") {
    return composeWithFlagship({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "flagship", abortSignal, tracker, brandSkin, captionStyle });
  }
  // BRIGHT LIFE TEMPLATE — a pack whose manifest declares renderer:"three-brightlife"
  // routes to the bright-cinematic Three.js composer (white ground, pastel gradients,
  // floating glass cards). Same funnel + envelope as the flagship above.
  if (rendererFor(framePack) === "three-brightlife") {
    return composeWithBrightlife({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "brightlife", abortSignal, tracker, brandSkin, captionStyle });
  }
  // BLUEPRINT ATELIER TEMPLATE — a pack whose manifest declares renderer:"blueprint"
  // routes to the native GSAP + SVG/CSS engineering-drawing composer. Self-contained
  // (its own chrome + scene-types); same funnel + envelope as the composers above.
  if (rendererFor(framePack) === "blueprint") {
    return composeWithBlueprint({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "blueprint", abortSignal, tracker, brandSkin, captionStyle, localized });
  }
  // BLOOM FABLE TEMPLATE — a pack whose manifest declares renderer:"bloom-fable" routes
  // to the native GSAP + SVG/CSS pastel-storybook composer. Same funnel + envelope.
  if (rendererFor(framePack) === "bloom-fable") {
    return composeWithBloom({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "bloom-fable", abortSignal, tracker, brandSkin, captionStyle, localized });
  }
  // BAUHAUS RIOT TEMPLATE — a pack whose manifest declares renderer:"bauhaus-riot"
  // routes to the native GSAP + SVG/CSS print-poster composer. Same funnel + envelope.
  if (rendererFor(framePack) === "bauhaus-riot") {
    return composeWithBauhaus({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "bauhaus-riot", abortSignal, tracker, brandSkin, captionStyle, localized });
  }

  // TERMINAL DEPARTURES TEMPLATE — a pack whose manifest declares renderer:"terminal-departures"
  if (rendererFor(framePack) === "terminal-departures") {
    return composeWithTerminal({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "terminal-departures", abortSignal, tracker, brandSkin, captionStyle });
  }

  // PAPER TALES TEMPLATE — a pack whose manifest declares renderer:"paper-tales"
  if (rendererFor(framePack) === "paper-tales") {
    return composeWithPaperTales({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "paper-tales", abortSignal, tracker, brandSkin, captionStyle, localized });
  }
  // IMPORTED PORTRAIT PACKS — table-dispatched native GSAP composers (prisma-bloc's
  // "dom-prisma", the seven om_stage skins, the om_port_kit ports, plus motion-canvas and
  // paper-craft from the OM set). All share one buildComposition contract, so a single
  // generic wrapper routes them.
  {
    const nativeModule = NATIVE_PACK_COMPOSERS[rendererFor(framePack)];
    if (nativeModule) {
      return composeWithNativePack({ module: nativeModule, storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || rendererFor(framePack), abortSignal, tracker, brandSkin, captionStyle, localized });
    }
  }
  // DEFAULT = the deterministic scene-kit (guaranteed showcase-grade, lint-clean,
  // per-pack styled). Every pipeline path (runJob, graph, project_pipeline) routes
  // through here, so this single dispatch makes the kit the primary composer
  // everywhere. The LLM path below runs only on an explicit `remix: true` opt-in.
  // `dress` (premium hybrid): a small bounded LLM pass art-directs the kit's
  // variants/emphasis/decor without any power to break the layout.
  if (!remix) {
    return composeWithSceneKit({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label: label || "scene-kit", abortSignal, tracker, dress, subject, brandSkin, layoutPlan, captionStyle, localized, motionPlan });
  }
  const t0 = ms();
  console.log(`[pipeline] ${label}: LLM remix compose start (assets=${assets.length}, framePack=${framePack || "none"})`);
  await composeWithLintRepair({
    storyboard, dims, jobDir, availableAssets: assets, tracker, abortSignal, framePack, captionCues,
  });
  // The LLM path writes index.html inside gateComposition (multiple laps), so
  // inject the caption language font/direction onto the final on-disk document
  // here — one post-process that catches whichever lap won. No-op for Latin.
  if (captionStyle) {
    try {
      const p = path.join(jobDir, "index.html");
      const finalHtml = fs.readFileSync(p, "utf8");
      writeIndexHtml(jobDir, finalHtml, captionStyle);
      // The freehand LLM composer names its caption element freely; the caption-language
      // override only reaches #kfcap/#cap-text/.cap. If the CAPTION language needs a font
      // or RTL and no such target exists, the burn-in would render as tofu (or Arabic LTR)
      // — warn instead of shipping that silently. (The video-text font rides `body, body *`
      // so it still reaches all text; only a distinct caption language needs the target.)
      const capSub = captionStyle.caption !== undefined ? captionStyle.caption : captionStyle;
      if (capSub && (capSub.fontFaceCss || capSub.direction === "rtl") && !hasCaptionTarget(finalHtml)) {
        console.warn(`[pipeline] ${label}: remix caption element missing #cap-text/#kfcap/.cap — ` +
          `${capSub.lang} captions may render without ${capSub.fontKey || "the language font"}` +
          `${capSub.direction === "rtl" ? "/RTL" : ""} (the SRT/VTT sidecar is unaffected).`);
      }
    } catch (e) { console.warn(`[pipeline] caption font inject (llm) skipped: ${e.message}`); }
  }
  console.log(`[pipeline] ${label}: compose done in ${ms() - t0}ms, render start`);
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  console.log(`[pipeline] ${label}: render done in ${ms() - t0}ms total`);
  // The LLM remix path composes freehand and never consulted the skin, so there is
  // no resolved brand to report — null, so the caller persists an honest "unbranded".
  return { ...visual, resolvedBrand: null };
}

// PRIMARY composition path — the deterministic SCENE-KIT. Builds a complete,
// showcase-grade, per-pack-styled composition from the storyboard in CODE (no LLM
// freehand → lint-clean by construction, no occlusion/truncation/junk). The agents
// still "think" (they wrote the storyboard + picked the assets); the kit guarantees
// the execution. This is the reliable default; the LLM composer is the opt-in remix.
async function composeWithSceneKit({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label, abortSignal, tracker, dress = false, subject = null, brandSkin = null, layoutPlan = null, captionStyle = null, localized = null, motionPlan = null }) {
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
  let built = sceneKit.buildComposition({ storyboard, dims, framePack, assets: assets || [], captionCues, seedKey: jobId, dressing, brandSkin, layoutPlan, localized, captionStyle, motionPlan });

  // USER-ASSET COVERAGE + one PRE-render repair lap. The kit reports which assets
  // it wove (built.usedAssets); if the user uploaded material and this weave
  // under-used it, re-weave ONCE with the presentation budget raised (montage to
  // 6, upload demotions cleared) before we pay for a render. Disclosure rides on
  // the returned visual (like resolvedBrand) for the caller to persist. Fail-open:
  // any hiccup keeps the first build.
  let assetCoverage = null;
  try {
    assetCoverage = coverageFromUsed({ assets: assets || [], usedAssets: built.usedAssets, logoPlacements: built.logoPlacements, repairLap: null });
    if (assetCoverage && shouldRepair({ assets: assets || [], coverage: assetCoverage })) {
      const before = assetCoverage.usagePercentage;
      // Clear the layout director's demotions on the user's OWN uploads and open
      // the montage so more of them can surface; rebuild once.
      for (const a of (assets || [])) { if (a && a.source === "upload" && a.__layoutDemoted) { a.__layoutDemoted = false; a.visionOk = true; } }
      const plan2 = { ...(layoutPlan || {}), __montageMax: 6 };
      const rebuilt = sceneKit.buildComposition({ storyboard, dims, framePack, assets: assets || [], captionCues, seedKey: jobId, dressing, brandSkin, layoutPlan: plan2, localized, captionStyle, motionPlan });
      const cov2 = coverageFromUsed({ assets: assets || [], usedAssets: rebuilt.usedAssets, logoPlacements: rebuilt.logoPlacements, repairLap: { ran: true, before, after: 0 } });
      // Keep the rebuild only if it actually surfaced more of the user's material.
      if (cov2 && cov2.assetsUsed >= assetCoverage.assetsUsed) {
        built = rebuilt;
        cov2.repairLap = { ran: true, before, after: cov2.usagePercentage };
        assetCoverage = cov2;
        console.log(`[pipeline] ${label || "scene-kit"}: coverage repair ${before}%→${cov2.usagePercentage}%`);
      }
    }
  } catch (e) { console.warn(`[pipeline] scene-kit coverage skipped (${String(e.message).slice(0, 120)})`); }

  // Apply the deterministic vector/motion floor (the same enrichment the LLM path
  // uses) so scene-kit videos also carry the richer particle + glyph + ring layer.
  // scene-kit emits the `vid` markers enrich needs; its own particles use class
  // "kfx"-free names so there's no selector collision.
  let indexHtml = built.indexHtml;
  try {
    const en = enrichComposition(indexHtml, {
      width: dims.width, height: dims.height, duration: durationSec,
      packTokens: framePack ? frameRegistry.getPackTokens(framePack) : null,
      flat: isFlatPack(framePack),
    });
    if (en.changed) { indexHtml = en.html; console.log(`[pipeline] ${label || "scene-kit"}: +vector/motion floor`); }
  } catch (e) { console.warn(`[pipeline] scene-kit enrich skipped (${String(e.message).slice(0, 120)})`); }
  // Inject the caption language font/direction INTO the variable (not just at the
  // write) — validate() below re-writes index.html from this same `indexHtml`, so
  // injecting only at write time would be clobbered by the validator's rewrite.
  indexHtml = injectCaptionStyle(indexHtml, captionStyle);
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
  visual.resolvedBrand = built.resolvedBrand || null;
  visual.assetCoverage = assetCoverage;
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

// THREE.JS composition path (opt-in via render3d) — a cinematic WebGL scene with
// DOM text overlays, driven by the same seeked timeline. Self-contained: no enrich
// (it has its own 3D particle field) and no stock-asset weaving (visuals are
// generated, not fetched).
async function composeWithThree({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "three"}: building Three.js/WebGL composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = threeComposer.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin });
  writeIndexHtml(jobDir, built.indexHtml, captionStyle);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  console.log(`[pipeline] ${label || "three"}: render done in ${ms() - t0}ms total`);
  return visual;
}


// FLAGSHIP composition path — a pack whose manifest declares renderer:"three-flagship"
// routes here (see attemptLlmComposition). A native Three.js cinematic launch film
// (flagship_composer.js): aurora depth, glass product plates presenting real
// screenshots OR generated product UI, a cinematic camera rig, selective bloom, and
// crisp kinetic DOM typography. Self-contained (its own 3D + generated visuals), so
// no enrich and no stock-asset weaving. Same envelope + seek contract as the others.
async function composeWithFlagship({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "flagship"}: building flagship Three.js composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = flagshipComposer.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, captionStyle });
  writeIndexHtml(jobDir, built.indexHtml, captionStyle);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  console.log(`[pipeline] ${label || "flagship"}: render done in ${ms() - t0}ms total`);
  return visual;
}


// BRIGHT LIFE composition path — a pack whose manifest declares renderer:"three-brightlife"
// routes here (see attemptLlmComposition). A native Three.js BRIGHT-cinematic launch film
// (brightlife_composer.js): an airy white canvas with soft pastel mesh gradients, floating
// gradient orbs + glass shapes, white glassmorphic product cards presenting real screenshots
// OR generated light dashboards, an easeInOutExpo camera rig, and indigo→violet kinetic
// typography. Self-contained (its own 3D + generated visuals), so no enrich and no stock-asset
// weaving. Same envelope + seek contract as the others.
async function composeWithBrightlife({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "brightlife"}: building Bright Life Three.js composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = brightlifeComposer.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, captionStyle });
  writeIndexHtml(jobDir, built.indexHtml, captionStyle);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  console.log(`[pipeline] ${label || "brightlife"}: render done in ${ms() - t0}ms total`);
  return visual;
}


// BLUEPRINT ATELIER composition path — a pack whose manifest declares renderer:"blueprint"
// routes here (see attemptLlmComposition). A native GSAP + SVG/CSS engineering-drawing
// film (blueprint_composer.js): a living drafting sheet (grid, rulers, compass, crosshair,
// title block), and the storyboard's scenes injected into blueprint scene-types (title /
// figure / flowchart / plot / revisions / cta). Self-contained (its own chrome + vector
// art), so no enrich and no stock-asset weaving. Same envelope + seek contract as the others.
async function composeWithBlueprint({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null, localized = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "blueprint"}: building Blueprint Atelier composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = blueprintComposer.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, localized });
  writeIndexHtml(jobDir, built.indexHtml, captionStyle);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  console.log(`[pipeline] ${label || "blueprint"}: render done in ${ms() - t0}ms total`);
  return visual;
}


// BLOOM FABLE composition path — a pack whose manifest declares renderer:"bloom-fable"
// routes here (see attemptLlmComposition). A native GSAP + SVG/CSS pastel-storybook film
// (bloom_composer.js): a persistent meadow (sun, clouds, hills, grass), and the storyboard's
// scenes injected into bloom scene-types (title / plant / cards / stat-rings / ribbons / cta),
// with real screenshots shown as framed cream cards. Self-contained; no enrich/weaving.
async function composeWithBloom({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null, localized = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "bloom-fable"}: building Bloom Fable composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = bloomComposer.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, localized });
  writeIndexHtml(jobDir, built.indexHtml, captionStyle);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  console.log(`[pipeline] ${label || "bloom-fable"}: render done in ${ms() - t0}ms total`);
  return visual;
}


// BAUHAUS RIOT composition path — a pack whose manifest declares renderer:"bauhaus-riot"
// routes here (see attemptLlmComposition). A native GSAP + SVG/CSS print-poster film
// (bauhaus_composer.js): cream paper + primary geometry + a sheet masthead, and the
// storyboard's scenes injected into bauhaus scene-types (title / recipe / stats /
// manifesto / eye / cta), with real screenshots shown as poster-framed panels.
async function composeWithBauhaus({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null, localized = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "bauhaus-riot"}: building Bauhaus Riot composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = bauhausComposer.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, localized });
  writeIndexHtml(jobDir, built.indexHtml, captionStyle);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  console.log(`[pipeline] ${label || "bauhaus-riot"}: render done in ${ms() - t0}ms total`);
  return visual;
}


// TERMINAL DEPARTURES composition path — a pack whose manifest declares
// renderer:"terminal-departures" routes here (see attemptLlmComposition). A native
// GSAP + SVG/CSS airport departures-hall film (terminal_departures_composer.js): a dark
// FIDS terminal with a signature split-flap board, hanging gate signs, a baggage belt, a
// security beam and — for real screenshots — a mounted gate MONITOR.
async function composeWithTerminal({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "terminal-departures"}: building Terminal Departures composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = terminalComposer.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin });
  writeIndexHtml(jobDir, built.indexHtml, captionStyle);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  console.log(`[pipeline] ${label || "terminal-departures"}: render done in ${ms() - t0}ms total`);
  return visual;
}


// PAPER TALES composition path — a pack whose manifest declares renderer:"paper-tales"
// routes here (see attemptLlmComposition). A native GSAP + SVG/CSS pop-up storybook film
// (paper_tales_composer.js): a physical book with 3D page turns, pop-up fold-ups, a pen
// that handwrites, and a pop-up paper cinema that shows a real screenshot.
async function composeWithPaperTales({ storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null, localized = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label || "paper-tales"}: building Paper Tales composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  const built = paperTalesComposer.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, localized });
  writeIndexHtml(jobDir, built.indexHtml, captionStyle);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  console.log(`[pipeline] ${label || "paper-tales"}: render done in ${ms() - t0}ms total`);
  return visual;
}


// Generic wrapper for the imported OM portrait packs — they all share one
// contract (buildComposition({storyboard,dims,framePack,captionCues,assets,brandSkin,localized})
// → {indexHtml,metaJson,resolvedBrand}), so one wrapper serves the whole table. captionStyle is
// applied at the writeIndexHtml choke point (these composers emit a #cap-text target).
async function composeWithNativePack({ module, storyboard, dims, jobDir, framePack, captionCues, assets, jobId, durationSec, label, abortSignal, tracker, brandSkin = null, captionStyle = null, localized = null }) {
  const t0 = ms();
  console.log(`[pipeline] ${label}: building native composition (${dims.width}x${dims.height}, ${durationSec}s, ${(assets || []).length} asset(s))`);
  // seedKey=jobId salts the per-video variants a composer chooses at BUILD time (cut
  // rhythm, ground rotation, decorative anchors), so re-running the same prompt produces
  // a visibly different film while a re-render of the SAME job stays byte-identical.
  // Composers that don't take it simply ignore the key.
  const built = module.buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, localized, seedKey: jobId });
  // BACKGROUND TIER. These packs place only assets the director marked hero/support, so a
  // `background` asset is discarded rather than demoted and its scene renders as a bare
  // template panel. Give those scenes the leftover imagery as a quiet blurred wash — see
  // services/scene_backdrop.js. Fail-open: any surprise returns the original HTML.
  let indexHtml = built.indexHtml;
  try {
    const { injectSceneBackdrops, injectPortraitTextSafety } = require("./scene_backdrop");
    const bd = injectSceneBackdrops({ indexHtml, assets: assets || [], storyboard, framePack, jobDir, dims });
    if (bd.injected.length) {
      indexHtml = bd.html;
      console.log(`[pipeline] ${label}: backdropped ${bd.injected.length} empty scene(s) with unused imagery (${bd.injected.map((x) => x.sceneId).join(", ")})`);
    }
    // 9:16 copy must wrap rather than leave the frame — the "Meet Claud…" clipping class.
    const ts = injectPortraitTextSafety({ indexHtml, dims });
    if (ts.applied) { indexHtml = ts.html; console.log(`[pipeline] ${label}: portrait text-safety applied`); }
  } catch (e) { console.warn(`[pipeline] ${label}: scene backdrops skipped (${String(e.message).slice(0, 120)})`); }
  writeIndexHtml(jobDir, indexHtml, captionStyle);
  const assetReport = discloseAssetRender(jobDir, indexHtml, assets, label);
  fs.writeFileSync(path.join(jobDir, "meta.json"), built.metaJson, "utf8");
  tracker.addExternal("hyperframes_render");
  const visual = await render({ jobId, jobDir, durationSec, abortSignal });
  visual.resolvedBrand = built.resolvedBrand || null;
  if (assetReport) visual.assetRenderReport = assetReport;
  console.log(`[pipeline] ${label}: render done in ${ms() - t0}ms total`);
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

async function buildAudio({ jobDir, storyboard, flags, tracker, perScene = false }) {
  const audioDir = path.join(jobDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  const { plan, tokensIn, tokensOut, model: servedModel, provider: servedBy, error: planErr } = await planAudio(storyboard, flags);
  tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "audio", model: servedModel, provider: servedBy });

  if (planErr) {
    console.warn(`[pipeline] audio planner failed: ${planErr}. Skipping audio.`);
    return { ttsPath: null, musicPath: null, sfx: [], musicVolume: 0.15 };
  }

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

  // TEMPLATE-AWARE AUDIO ON THIS PATH TOO.
  //
  // This branch used to call `fetchMusic({ query: plan.music.query })` — the SCRIPT's
  // subject-derived query, which is the exact defect services/audio_profile.js exists to
  // fix. Three things were lost by not passing the rest:
  //   • no `candidates` → musicCandidatesFor never ran, so the pack's own keywords never
  //     reached the provider and every template searched alike;
  //   • no `style`     → scoreTrack's tag-overlap term (max +30) scored 0 for every track;
  //   • no `durationSec` → the LENGTH-FIT term (−15…+40, the dominant signal) scored 0.
  // Ranking therefore collapsed to rating + downloads, which is "generic music" by
  // construction. The graph path has done this correctly for a while; this brings
  // /api/generate in line. Same fail-soft contract — a pack with no audio block resolves
  // to NEUTRAL and this behaves exactly as it did before.
  const audioProfile = audioProfileSvc.profileFor(framePack);
  const musicSelection = {};
  const musicPlan = audioProfileSvc.musicCandidatesFor({
    framePack, jobId, narration: flags.tts ? "on" : "off",
    scriptMusic: plan.music || null, profile: audioProfile,
  });
  if (flags.music && musicPlan.candidates.length) {
    console.log(`[pipeline] music search (${musicPlan.source}${musicPlan.keywords.length ? `: ${musicPlan.keywords.join(" + ")}` : ""}) → ${musicPlan.candidates.slice(0, 3).map((c) => `"${c}"`).join(", ")}`);
  }
  const musicTask = (flags.music && musicPlan.candidates.length)
    ? fetchMusic({
        candidates: musicPlan.candidates, outputPath: path.join(audioDir, "music.mp3"),
        tracker, durationSec: duration, style: audioProfile.style, selection: musicSelection,
        // Per-job search window, and no synthesized pad when the bed is the whole
        // soundtrack — see the notes in audio_sources.fetchMusic.
        seed: `${jobId || ""}|${framePack || ""}`,
        allowGeneratedPad: !!flags.tts,
        jobId: jobId || "", framePack: framePack || "",
      })
        .then((p) => { if (p) console.log(`[pipeline] music fetched (${musicSelection.provider || "?"}: "${musicSelection.query || ""}")`); return p; })
        .catch((e) => { console.warn(`[pipeline] music failed: ${e.message}`); return null; })
    : Promise.resolve(null);

  // SFX likewise: `fetchSfx` is the WEB fallback, not the entry point. Calling it directly
  // skipped the curated library, the intent vocabulary, the template's palette AND
  // conditionCue — so cues arrived unconditioned, at whatever level the provider happened
  // to serve, which is the level defect audio_cues documents. getSfx is the front door.
  const sfxPlan = (flags.soundEffect && Array.isArray(plan.soundEffects)) ? plan.soundEffects : [];
  const sfxTasks = sfxPlan.map((s, i) => {
    // Resolve the script's free-text word to a CUES INTENT first — paletteCueFor keys on
    // intents (whoosh, ui-click…), not on raw words, so passing "transition" straight in
    // silently no-ops the palette and every template gets the house cue.
    const raw = s.name || s.query;
    const cue = audioProfileSvc.paletteCueFor(audioProfile, resolveIntent(raw) || raw);
    return getSfx({ name: cue, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
      .then((p) => p ? { path: p, startSec: s.startSec, volume: s.volume, name: cue } : null)
      .catch(() => null);
  });

  const [ttsPath, musicPath, ...sfxResults] = await Promise.all([ttsTask, musicTask, ...sfxTasks]);
  const sfx = sfxResults.filter(Boolean);
  if (sfx.length) console.log(`[pipeline] sfx: ${sfx.length}/${sfxPlan.length} fetched`);

  return {
    ttsPath, musicPath, sfx, musicVolume,
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

async function mixAudioIntoVideo({ visualPath, durationSec, audio }) {
  if (!audio.ttsPath && !audio.musicPath && audio.sfx.length === 0) return false;
  const mixedPath = path.join(config.paths.videosDir, path.basename(visualPath) + ".tmp.mp4");
  await audioMix({
    videoPath: visualPath, outputPath: mixedPath, durationSec,
    ttsPath: audio.ttsPath, musicPath: audio.musicPath,
    musicVolume: audio.musicVolume, sfx: audio.sfx,
    audioPlan: audio.audioPlan || null,
  });
  await replaceFile(mixedPath, visualPath);
  return true;
}

// ========== Main ==========

async function runJob({
  jobId, prompt, duration, orientation, width, height, fps,
  tts = false, music = false, soundEffect = false, voice,
  images = false, video = false, framePack = null, remix = false, render3d = false,
  brandPalette = null,
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
  // An explicit user brand palette is the ONLY branding available on the /api/generate
  // path (no website ingest / Art Director runs here). Resolve it verbatim to a
  // deterministic accent-only skin (provenance "explicit" — honored as-is, no LLM), then
  // thread it into every composer below. Null when no palette was picked → the composers'
  // no-op path, byte-identical to the pack default.
  const brandSkin = brandPalette && brandPalette.primary
    ? defaultBrandSkin(
        [brandPalette.primary, brandPalette.secondary, brandPalette.accent].filter(Boolean),
        { provenance: "explicit" }
      )
    : null;
  if (brandSkin) log.info("brand palette resolved (explicit)", { accents: brandSkin.accents.join(",") });
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
    {
      const t0 = ms();
      db.setProgress(jobId, "brief");
      try {
        const intent = { prompt, preferences: { duration, orientation, voiceStyle: voice || "auto", framePack: framePack || "auto" } };
        const briefRes = await generateBrief({ intent });
        tracker.addLlm({ inputTokens: briefRes.tokensIn, outputTokens: briefRes.tokensOut, stage: "brief", model: briefRes.model, provider: briefRes.provider });
        effectivePrompt = enrichedStoryboardPrompt(briefRes.brief, prompt);
        // Subject anchor for the asset stage's stock queries + vision gate.
        briefSubject = (briefRes.brief && briefRes.brief.subject) ? String(briefRes.brief.subject).trim() : null;
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
      tracker.addLlm({ inputTokens: sbRes.tokensIn, outputTokens: sbRes.tokensOut, stage: "storyboard", model: sbRes.model, provider: sbRes.provider });
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
          flags: { tts, music, soundEffect, voice }, tracker, perScene: tts,
        }).catch((e) => {
          console.warn(`[pipeline] background audio stage failed: ${e.message}`);
          return { ttsPath: null, musicPath: null, sfx: [], musicVolume: 0.15 };
        })
      : Promise.resolve(null);

    let allAssets = [];
    if (images || video) {
      const t0 = ms();
      const va = await planAndFetchAssets({
        jobDir, storyboard: sbRes.storyboard,
        flags: { images, video }, orientation, tracker, subject: briefSubject, framePack,
      }).catch((e) => {
        console.warn(`[pipeline] asset stage threw: ${e.message}`);
        return { assets: [] };
      });
      allAssets = va.assets;
      markStage("assets", t0);
      console.log(`[pipeline] assets completed in ${timings.assetsMs}ms (${allAssets.length} fetched; audio running in parallel)`);

      // ---- Creative Director review (curate/score/assign before composition) ----
      // Supersedes the simple vision gate above; fail-open (returns assets
      // unchanged on any error). Annotates visionOk/sceneId so the composer honors
      // its decisions. Persists the review to the job for the UI.
      if (config.creativeDirector.enabled && allAssets.length) {
        const tcd = ms();
        db.setProgress(jobId, "creative_review");
        allAssets = await reviewAndCurate({
          jobId, storyboard: sbRes.storyboard, subject: briefSubject,
          framePack, assets: allAssets, tracker, jobDir, orientation,
        });
        markStage("creativeReview", tcd);
        console.log(`[pipeline] creative director review done in ${timings.creativeReviewMs}ms (${allAssets.length} asset(s) kept)`);
      }
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
        voice: voice || "marin",
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
              assets: allAssets, jobId, durationSec: effectiveDuration, label: "three", abortSignal: signal, tracker, brandSkin,
            }),
            budget, "Three.js composition"
          );
          finalAttempt = "three";
          console.log(`[pipeline] Three.js composition+render succeeded in ${ms() - t0}ms`);
        } else {
          visualResult = await withBudget(
            (signal) => attemptLlmComposition({
              storyboard: sbRes.storyboard, dims, jobDir,
              assets: allAssets, tracker, jobId, durationSec: effectiveDuration,
              label: remix ? "remix" : "scene-kit", abortSignal: signal, framePack, remix, brandSkin,
            }),
            budget, remix ? "LLM remix composition" : "scene-kit composition"
          );
          finalAttempt = remix ? "remix" : "scenekit";
          console.log(`[pipeline] ${remix ? "LLM remix" : "scene-kit"} composition+render succeeded in ${timings.compose_renderMs}ms`);
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
            label: "no-videos", abortSignal: signal, framePack, brandSkin,
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
          label: "scene-kit fallback", tracker, brandSkin,
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
    // What was actually MIXED, not what was asked for. The delivery probe asserts the film
    // carries an audio track from this, and it must not assert it from `wantsAudio`: a job can
    // legitimately request music, have every provider fail, and deliver a correct silent film.
    // Blaming the mix step for that would be a blocker whose suggested remedy cannot work.
    let audioMixed = false;
    if (wantsAudio) {
      const t0 = ms();
      db.setProgress(jobId, "audio");
      try {
        const prepped = await audioPromise;
        // Audio Director decides the per-scene mastering plan (loudness, music
        // curve, ducking, SFX curation). Fail-open — null falls back to basic mix.
        const audioPlan = prepped ? await directAudio({
          jobId, storyboard: sbRes.storyboard, voClips,
          sfxClips: prepped.sfx || [], musicPath: prepped.musicPath,
          subject: prompt, durationSec: effectiveDuration, tracker,
        }).catch(() => null) : null;
        // Fold the per-scene VO clips (each tagged kind:"vo" with its scene-start
        // offset) into the sfx list so the mixer lands them at the right time and
        // ducks the music under speech. In perScene mode prepped.ttsPath is null.
        const audio = prepped ? {
          ttsPath: prepped.ttsPath,
          musicPath: prepped.musicPath,
          musicVolume: prepped.musicVolume,
          sfx: [...(prepped.sfx || []), ...voClips],
          audioPlan,
        } : null;
        const mixed = audio ? await mixAudioIntoVideo({
          visualPath: visualResult.videoPath,
          durationSec: effectiveDuration, audio,
        }).catch((e) => { console.warn(`[pipeline] mix failed: ${e.message}`); return false; }) : false;
        audioMixed = mixed === true;
        markStage("audio", t0);
        console.log(`[pipeline] audio ${mixed ? "mixed in" : "(nothing to mix)"} in ${timings.audioMs}ms (was prepared in parallel)`);
      } catch (e) {
        markStage("audio", t0);
        console.warn(`[pipeline] audio stage failed: ${e.message}`);
      }
    }

    // ---- Finalize ----
    db.setProgress(jobId, "finalizing");
    // PROBE THE ARTIFACT, not the plan. Everything above this line describes what the pipeline
    // intended; this is the one check that opens the file it just wrote.
    await require("./video_probe").recordDeliveryProbe(jobId, visualResult.videoPath, {
      width, height, fps, durationSec: effectiveDuration, expectAudio: audioMixed,
    });
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

module.exports = { runJob, withBudget, attemptLlmComposition, composeWithThree, isAssetRich, mixAudioIntoVideo, fallbackQueriesFor, composerStringsFor, composerModuleFor };
