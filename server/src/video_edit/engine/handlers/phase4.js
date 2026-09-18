// VIDEO EDIT PHASE-4 STAGE HANDLER — BUILDING_EDIT_PLAN.
//
// WHY THIS EXISTS. Every analysis stage before this one writes a FILE; this one turns those files into the
// project's first Edit Plan and commits it as revision 1, which is what makes a project editable at all
// (EDIT_PLAN.md §6). It is deliberately thin: `director/build_plan.js buildInitialPlan` already owns the
// order in which transcript, detections, faces, content, director opportunities, rhythm, B-roll, captions,
// music and branding become a plan, and `plan/revisions.js commitRevision` owns validation + persistence.
// The handler's own job is the four things only the engine can do — decide WHICH upstream artifacts exist,
// hash the inputs so a resume is free, hand the director a budgeted LLM client, and decide whether this run
// is the project's FIRST plan or a re-plan over analysis that has since changed.
//
//   BUILDING_EDIT_PLAN  (deps ANALYZING_CONTENT + ANALYZING_VIDEO, and SCORING_ASSETS when phase 5 is
//                       registered)  analysis/* → buildInitialPlan → commitRevision → plan/revisions/r000001.json
//
// Reuse, not reimplementation: the artifacts are read through `editing/context.js createContextLoader`,
// the SAME loader the editing routes use, so the words, sentences, envelope, face track, scenes and
// B-roll slots the director sees are byte-for-byte the ones a later op will see. Plan settings come from
// `plan/schema.js planSettingsFromProject`.
//
// FAILURE POLICY (ENGINE.md §6). An LLM failure is never an edit failure: `buildInitialPlan` falls back to
// the heuristic director internally (`createdBy:'heuristic'`, notice HEURISTIC_DIRECTOR), so the only things
// that leave this handler are cancellation (re-thrown untouched) and real bugs (PLAN_BUILD_INVALID). A
// transcript that never arrived is not an error either — `continueWithout:'transcript'` still produces a
// plan (silence cuts only, captions off). Paid director work is booked even when a later attempt fails.
//
// NOT HERE. The uploaded logo is still `source/logo.bin` with `uploads.logo.status:'pending'`; re-encoding
// it and attaching it to `plan.branding.logo` belongs to the branding/render phase, so this handler passes
// only the palette the user chose (carried by plan settings' `brandColors`).
//
// CONTRACT:
//   stages(deps, { registry }) -> [BUILDING_EDIT_PLAN def]   (deps list derived from `registry`)
//   register(registry = stages.defaultRegistry, deps) -> registry
//   deps = { callJson?, contextLoader? }   (tests inject; production uses ai/llm.js + its own loader)
//   STAGE_VERSIONS

const crypto = require("node:crypto");
const stagesModule = require("../stages");
const fsx = require("../../fsx");
const { isEditError } = require("../../errors");

const STAGE_VERSIONS = Object.freeze({ BUILDING_EDIT_PLAN: 1 });
// The plan builder and the LLM client stamp their notices with an LLM stage id ('ve_director') and carry a
// `reason`; a PROJECT notice is `{code, severity, stage, message}` with `stage` a PIPELINE stage (the runner
// fills it in when the notice leaves it null). So each code gets the sentence the editor should show.
const NOTICE_TEXT = Object.freeze({
  HEURISTIC_DIRECTOR: "A simpler edit was created — the AI director was unavailable. You can regenerate it.",
  MODEL_FALLBACK: "The edit was planned with a backup AI model.",
  PLAN_REBUILT: "The new analysis changed the transcript, so the edit was planned again. Your earlier version is still in the history.",
  BROLL_UNAVAILABLE: "A B-roll clip could not be downloaded, so you stay on screen there. You can pick another clip.",
  BROLL_REPLACED_UNAVAILABLE: "A chosen B-roll clip was unavailable, so the next best match was used.",
  MUSIC_UNAVAILABLE: "No background music could be fetched right now. You can add music in the editor.",
  LOGO_NOT_PROCESSED: "Your logo could not be read; add it again in the editor.",
  MATERIALIZE_DEFERRED: "Some B-roll and music are still downloading; they are added when the preview renders.",
});
// Plan-time materialization notices are informational (the edit is complete without them).
const INFO_CODES = new Set(["MODEL_FALLBACK", "BROLL_REPLACED_UNAVAILABLE", "MATERIALIZE_DEFERRED"]);
const LLM_CACHE_REL = "analysis/llm-cache";
const REQUIRED_DEPS = Object.freeze(["ANALYZING_CONTENT", "ANALYZING_VIDEO"]);
const OPTIONAL_DEPS = Object.freeze(["SCORING_ASSETS"]);
const ASPECTS = Object.freeze(["9:16", "16:9", "1:1"]);
const LANG_RE = /^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})?)$/;   // plan/schema.js SourceSchema
const PROFILE_LONG_EDGE = Object.freeze({ preview540: 960, export720: 1280, export1080: 1920 });

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const r8 = (x) => Math.round(x * 1e8) / 1e8;

// Book paid work that a failing attempt already spent (the runner books only successful results).
async function bookCost(ctx, stage, usd) {
  const c = Number(usd);
  if (!(c > 0)) return;
  try {
    await ctx.updateProject((d) => {
      d.cost = isPlain(d.cost) ? d.cost : { estimateUsd: 0, capUsd: 0, spentUsd: 0, byStage: {} };
      d.cost.spentUsd = r8((Number(d.cost.spentUsd) || 0) + c);
      d.cost.byStage = isPlain(d.cost.byStage) ? d.cost.byStage : {};
      d.cost.byStage[stage] = r8((Number(d.cost.byStage[stage]) || 0) + c);
    });
  } catch { /* fenced or store trouble: the failure itself is what matters */ }
}

function mods() {
  return {
    buildPlan: require("../../director/build_plan"),
    director: require("../../director/director"),
    schema: require("../../plan/schema"),
    revisions: require("../../plan/revisions"),
    context: require("../../editing/context"),
    llm: require("../../ai/llm"),
    materialize: require("../../render/materialize"),
  };
}

function projectSettings(ctx) {
  const p = ctx.project || {};
  return isPlain(p.settings) ? p.settings : {};
}

// The model the director should use, when the operator pinned one for the `ve_director` stage.
function directorModel(ctx) {
  const llm = ctx.settings && ctx.settings.providers ? ctx.settings.providers.llm : null;
  const sm = llm && isPlain(llm.stageModels) ? llm.stageModels : {};
  return sm.ve_director || null;
}

// Which upstream stages this checkout actually has. Phase 5 is optional (handlers/index.js registers
// phase4 last so this can see it), and a project that ran before phase 5 existed must not be invalidated.
function depsFor(registry) {
  const has = (n) => !!(registry && typeof registry.getStage === "function" && registry.getStage(n));
  return [...REQUIRED_DEPS, ...OPTIONAL_DEPS.filter(has)];
}

function sourceDims(project) {
  const v = project && isPlain(project.source) && isPlain(project.source.video) ? project.source.video : null;
  if (!v) return null;
  const w = num(v.displayWidth) || num(v.width);
  const h = num(v.displayHeight) || num(v.height);
  if (!(w > 0) || !(h > 0)) return null;
  if (v.displayWidth == null && v.displayHeight == null && Math.abs(num(v.rotation) || 0) % 180 === 90) return { w: h, h: w };
  return { w, h };
}

// The plan's aspect MUST be the one B-roll was searched for, so phase 5 owns this rule when it exists and
// the copy below is only for a checkout without it (handlers/index.js loads phase files opportunistically).
let phase5Geometry;
function outputGeometry(project) {
  if (phase5Geometry === undefined) {
    try { const p5 = require("./phase5"); phase5Geometry = typeof p5.outputGeometry === "function" ? p5.outputGeometry : null; }
    catch { phase5Geometry = null; }
  }
  if (phase5Geometry) return { ...phase5Geometry(project), background: "none" };
  return localGeometry(project);
}

function localGeometry(project) {
  const s = project && isPlain(project.settings) ? project.settings : {};
  let aspect = isPlain(s.output) && ASPECTS.includes(s.output.aspect) ? s.output.aspect : null;
  if (!aspect) {
    const dims = sourceDims(project);
    if (!dims) aspect = "9:16";
    else {
      const r = dims.w / dims.h;
      aspect = Math.abs(r - 1) <= 0.05 ? "1:1" : (r > 1 ? "16:9" : "9:16");
    }
  }
  const long = PROFILE_LONG_EDGE[s.exportProfile] || PROFILE_LONG_EDGE.export1080;
  const short = Math.round((long * 9) / 16 / 2) * 2;
  if (aspect === "16:9") return { aspect, width: long, height: short, background: "none" };
  if (aspect === "1:1") return { aspect, width: short, height: short, background: "none" };
  return { aspect, width: short, height: long, background: "none" };
}

function stageOutputSha(project, stage, name) {
  const r = project && isPlain(project.stages) ? project.stages[stage] : null;
  const o = r && isPlain(r.outputs) ? r.outputs[name] : null;
  return o && typeof o.sha256 === "string" ? o.sha256 : null;
}

// The plan's `source` block is an IDENTITY for the footage the plan was built from, not a file pointer:
// it tells a later revision whether the analysis it rests on is still the same footage. The store keeps a
// sha256, the plan schema wants 40 hex, so the identity is hashed down from the strongest thing available
// (the mezzanine's content hash, else the upload's sha256, else the project id).
function planSource(project, data, geometry) {
  const src = isPlain(project.source) ? project.source : {};
  const mezz = isPlain(src.mezzanine) ? src.mezzanine : null;
  const identity = stageOutputSha(project, "COMPRESSING", "mezz") || src.sha256 || project.id;
  const sha1 = crypto.createHash("sha1").update(`ve-source|${identity}`).digest("hex");
  const dims = sourceDims(project) || { w: geometry.width, h: geometry.height };
  const versions = ["TRANSCRIBING", "ANALYZING_VIDEO", "ANALYZING_CONTENT"]
    .map((s) => { const r = isPlain(project.stages) ? project.stages[s] : null; return r && r.version != null ? String(r.version) : "0"; })
    .join(".");
  return {
    assetId: `ast_${crypto.createHash("sha1").update(`ve-asset|${identity}`).digest("hex").slice(0, 16)}`,
    sha1,
    durationSec: num(mezz && mezz.durationSec) || num(src.durationSec) || num(data.audio && data.audio.durationSec) || 1,
    fps: 30,
    width: num(mezz && mezz.width) || dims.w,
    height: num(mezz && mezz.height) || dims.h,
    analysisVersion: versions,
    transcriptHash: stageOutputSha(project, "TRANSCRIBING", "transcript"),
    timing: data.timing === "approx" ? "approx" : "word",
    // A provider that answers something other than a BCP-47-ish tag must not fail the whole plan (INVALID_PLAN
    // is a bug class): an unknown language is 'und', which the builder already treats as "no language".
    language: LANG_RE.test(String(data.language || "")) ? data.language : "und",
  };
}

function captionPositionOf(ps) {
  const p = isPlain(ps.captions) ? ps.captions.position : null;
  return ["auto", "top", "center", "bottom"].includes(p) ? p : "auto";
}

// The plan revision this project is currently on (0 = it has never had one).
function committedRevision(project) {
  const pl = project && isPlain(project.plan) ? project.plan : null;
  const head = pl && Number.isInteger(pl.headRevision) ? pl.headRevision : 0;
  return head >= 1 ? head : 0;
}

function revRel(rev) {
  return `plan/revisions/r${String(rev).padStart(6, "0")}.json`;
}

function stages(deps = {}, { registry = null } = {}) {
  const d = isPlain(deps) ? deps : {};
  const stageDeps = depsFor(registry);
  let loader = d.contextLoader || null;

  const BUILDING_EDIT_PLAN = {
    name: "BUILDING_EDIT_PLAN",
    version: STAGE_VERSIONS.BUILDING_EDIT_PLAN,
    deps: stageDeps,
    heavy: false,
    weight: 8,
    inputHash(ctx) {
      const m = mods();
      const ps = projectSettings(ctx);
      return {
        upstream: stagesModule.upstreamFingerprint(ctx.project, stageDeps),
        // Everything the plan builder reads out of the project settings, in its own vocabulary, so a
        // settings change that cannot move the plan cannot invalidate this stage either.
        planSettings: fsx.sha256Json(m.schema.planSettingsFromProject(ps)),
        output: fsx.sha256Json(outputGeometry(ctx.project)),
        captionPosition: captionPositionOf(ps),
        model: directorModel(ctx),
        promptVersion: m.director.PROMPT_VERSION,
      };
    },
    // ENGINE.md §5.2: 120 s per attempt; the runner gives the stage two of them.
    budgetMs() { return 120 * 1000; },
    async run(ctx) {
      const m = mods();
      const startedAt = Date.now();
      const project = ctx.project || {};
      // A plan already at the head means this stage is running AGAIN over analysis that has changed (the
      // re-analysis path: POST /:id/settings confirmed → runner.retry force from TRANSCRIBING). The runner
      // only calls run() when the checkpoint missed, so that plan is stale by definition — see below for
      // how much of the user's work can be carried into its replacement.
      const head = committedRevision(project);
      const headDoc = head ? ctx.store.loadRevision(project.id, head) : null;

      if (!loader) loader = m.context.createContextLoader({ store: ctx.store, log: ctx.log, maxEntries: 1 });
      const data = loader.load(project);
      const ps = projectSettings(ctx);
      const geometry = outputGeometry(project);
      const notices = [];
      let spent = 0;

      ctx.progress(4, "Designing the edit");
      const callJson = d.callJson || m.llm.callJson;

      const planCtx = {
        projectId: project.id,
        source: planSource(project, data, geometry),
        output: geometry,
        settings: m.schema.planSettingsFromProject(ps),
        words: data.words,
        sentences: data.sentences,
        transcriptMeta: data.transcriptMeta,
        audio: data.audio,
        faces: data.faces,
        content: data.content,
        envelope: data.envelope,
        mezz: data.mezz,
        scenes: data.scenes,
        shaky: data.shaky,
        brollSlots: data.brollSlots,
        captionPosition: captionPositionOf(ps),
        now: ctx.now(),
        onNotice: (n) => { if (isPlain(n)) notices.push(n); },
        director: {
          callJson,
          tracker: ctx.tracker,
          signal: ctx.signal,
          cacheDir: ctx.abs(LLM_CACHE_REL),
          model: directorModel(ctx),
          onNotice: (n) => { if (isPlain(n)) notices.push(n); },
          onCost: (e) => { spent += num(e && e.costUsd) || 0; },
        },
      };

      // Keeping the user's work is only safe while their anchors still mean something: every element on the
      // plan points at WORDS. A re-analysis that produced the same transcript (cloud vision turned back on,
      // say) can be re-planned in place; one that produced a different transcript (a forced spoken language)
      // leaves every anchor dangling — `redirect` answers PLAN_BUILD_INVALID for that — so the plan is built
      // fresh. Nothing is lost either way: revisions are immutable, so the old plan stays in the history.
      const prior = headDoc && isPlain(headDoc.plan) && isPlain(headDoc.plan.source) ? headDoc.plan : null;
      const sameFootage = !!prior && prior.source.sha1 === planCtx.source.sha1
        && prior.source.transcriptHash === planCtx.source.transcriptHash;

      let plan;
      try {
        if (!sameFootage) {
          if (prior) notices.push({ code: "PLAN_REBUILT" });
          plan = await m.buildPlan.buildInitialPlan(planCtx);
        } else {
          try {
            plan = await m.buildPlan.redirect(prior, planCtx, { keepLocked: true });
          } catch (e) {
            // A re-plan that cannot be assembled is never worth parking the project for.
            if (!isEditError(e) || e.code !== "PLAN_BUILD_INVALID") throw e;
            ctx.log.warn(`[video-edit] re-plan fell back to a fresh plan project=${project.id}`);
            notices.push({ code: "PLAN_REBUILT" });
            plan = await m.buildPlan.buildInitialPlan(planCtx);
          }
        }
      } catch (e) {
        // Cancellation owes nothing; anything else already spent its tokens (the runner books only successes).
        if (!(isEditError(e) && e.errorClass === "cancelled")) await bookCost(ctx, "BUILDING_EDIT_PLAN", spent);
        throw e;
      }

      // Materialize before revision 1: downloaded B-roll, a chosen music track (+ alternatives) and the uploaded
      // logo land in the first plan, so the editor shows real clips and "Change music" has candidates. Bounded by what
      // is left of this attempt's budget; anything not done in time is fetched at render time (MATERIALIZE_DEFERRED).
      let logoSet = false;
      if (d.materialize !== false) {
        ctx.progress(70, "Getting your B-roll and music");
        const left = (Number(ctx.budgetMs) || 120000) - (Date.now() - startedAt) - 20000;
        const hadLogo = !!(plan.branding && plan.branding.logo);
        try {
          const mat = await (d.materializePlan || m.materialize.materializePlan)(plan, {
            projectDir: ctx.projectDir, project, signal: ctx.signal, deadlineMs: Math.max(5000, Math.min(75000, left)), log: ctx.log, pidFile: ctx.pidFile,
          });
          for (const n of mat.notes) notices.push({ code: n.code });
          logoSet = !hadLogo && !!(plan.branding && plan.branding.logo);
        } catch (e) {
          if (isEditError(e) && e.errorClass === "cancelled") throw e;
          if (ctx.signal && ctx.signal.aborted) throw e;
          ctx.log.warn(`[video-edit] plan materialization failed project=${project.id} code=${(e && e.code) || "INTERNAL"}`);
          notices.push({ code: "MATERIALIZE_DEFERRED" });
        }
      }

      ctx.progress(85, "Saving the edit plan");
      const committed = await m.revisions.commitRevision({
        store: ctx.store,
        projectId: project.id,
        plan,
        author: plan.createdBy === "heuristic" ? "heuristic" : "director",
        summary: headDoc ? "Re-planned after new analysis" : "AI edit",
        expectedRevision: head,
        now: ctx.now(),
        runId: ctx.runId,
      });

      if (logoSet) {
        const l = plan.branding.logo;
        await ctx.store.update(project.id, (dd) => {
          dd.uploads = { ...(isPlain(dd.uploads) ? dd.uploads : {}), logo: { ...((dd.uploads && dd.uploads.logo) || {}), status: "ready", assetId: l.assetId, path: l.path } };
        }, { runId: ctx.runId }).catch(() => {});
      }
      ctx.emit("plan", { revision: committed.revision, hash: committed.hash, createdBy: plan.createdBy });
      return {
        outputs: { plan: { path: revRel(committed.revision) } },
        engine: plan.createdBy === "heuristic" ? "heuristic" : "director",
        fallbacks: plan.createdBy === "heuristic" ? ["director"] : [],
        // The builder tells `onNotice` and `director.onNotice` about the same fallback, so dedupe by code.
        notices: [...new Set(notices.map((n) => n.code))].map((code) => ({
          code,
          severity: INFO_CODES.has(code) ? "info" : "warn",
          stage: null,
          message: NOTICE_TEXT[code] || "The edit plan was created with a fallback.",
        })),
        costUsd: spent,
      };
    },
  };

  return [BUILDING_EDIT_PLAN];
}

function register(registry = stagesModule.defaultRegistry, deps = {}) {
  for (const def of stages(deps, { registry })) registry.registerStage(def);
  return registry;
}

module.exports = { stages, register, STAGE_VERSIONS };
