// TEMPLATE TEST RENDER — make a real film with a template, through the real pipeline.
//
// Product spec section 13: the admin must be able to test a template before publishing, using
// the EXISTING video-generation pipeline rather than a bespoke preview path. That is the whole
// point — a template that renders beautifully in a synthetic harness and falls apart on a real
// job with real assets, real copy lengths and real narration has not been tested.
//
// So this creates an ordinary project job. Same db record, same queue, same LangGraph
// production, same QA. The only two things that make it a test are that the frame pack is
// PINNED to the template under review, and that the record carries `admin_test` so the admin UI
// can find it again.
//
// WHY PINNING IS SAFE, AND WHY IT HAD TO BE CHECKED. agents/graph.js frameSelectorAgent can
// REROUTE a job onto a different pack three separate ways — orientation mismatch, visual-supply
// shortfall, and non-Latin on-screen text. If any of those applied to an explicit choice, an
// admin's "test this template" could quietly render a DIFFERENT template and the whole review
// loop would be worthless. Reading the node (graph.js:372-466): all three branch on
// `via === "user"`, and the user branch HONOURS the pick and writes a disclosure note instead
// of swapping. `via` is "user" when `job.intent.preferences.framePack` is a real pack id — so
// that is the field this module sets, not `frame_pack` (which intake overwrites with the
// brief's suggestion).

const path = require("node:path");
const config = require("../config");
const db = require("../db");
const frameRegistry = require("../services/frame_registry");
const paths = require("./paths");

// Realistic scenarios rather than a combinatorial matrix. The spec lists eleven dimensions to
// test (prompt-only, URL, uploads, logo, brand colour, copy length, asset count, VO on/off,
// captions on/off); rendering the cross-product would be hundreds of films. These are the
// combinations that actually exercise DIFFERENT code paths through the template: how it behaves
// with no imagery, with plenty, with a brand colour, and with narration off (which is when
// burned-in captions carry the film and the layout has to hold them).
const SCENARIOS = Object.freeze({
  "prompt-only": {
    label: "Prompt only",
    hint: "No website, no uploads — the template must carry the film on type alone.",
    body: {
      prompt: "A 24-second launch film for Northwind, a team analytics tool that turns raw product events into a weekly digest. Confident, concrete, no buzzwords.",
      duration: 24, voiceover: true, captions: true,
    },
  },
  "website": {
    label: "Website URL",
    hint: "Real screenshots and a harvested brand palette — the asset-heavy path.",
    body: {
      websiteUrl: "https://stripe.com",
      prompt: "A 24-second product film built from the site.",
      duration: 24, voiceover: true, captions: true,
    },
  },
  "brand-color": {
    label: "Brand colour",
    hint: "An explicit palette, to prove the template re-tints instead of ignoring it.",
    body: {
      prompt: "A 20-second brand film for Northwind, a team analytics tool. Warm, human, direct.",
      duration: 20, voiceover: true, captions: true, brandPalette: ["#ff6a00", "#1b1b1f"],
    },
  },
  "no-voiceover": {
    label: "No voiceover",
    hint: "Music-led and silent-autoplay — captions carry the film, so the layout must hold them.",
    body: {
      prompt: "A 20-second silent-autoplay social cut for Northwind, a team analytics tool. Punchy, caption-first.",
      duration: 20, voiceover: false, captions: true,
    },
  },
  "long-copy": {
    label: "Long copy",
    hint: "Deliberately verbose headlines — this is where type fitting and overflow break.",
    body: {
      prompt: "A 30-second explainer for Northwind Analytics Platform, covering how it consolidates fragmented product telemetry from multiple sources into a single weekly executive digest that non-technical stakeholders can actually act on. Thorough and explanatory rather than punchy.",
      duration: 30, voiceover: true, captions: true,
    },
  },
});

function scenarioList() {
  return Object.entries(SCENARIOS).map(([id, s]) => ({ id, label: s.label, hint: s.hint }));
}

// Create + enqueue a real project job pinned to `slug`.
//
// `enqueueIntake` is injected rather than imported so this module has no opinion about the
// queue, exactly as routes/projects.js does it.
function startTestRender({ slug, scenario = "prompt-only", record, createdBy, enqueueIntake }) {
  paths.assertSlug(slug);

  // resolveAnyPack, NOT resolvePack: the whole point is to render a pack that is deliberately
  // invisible to users. This is the admin-only resolver and this is the admin-only path.
  if (!frameRegistry.resolveAnyPack(slug)) {
    const e = new Error(`template "${slug}" has no installed pack directory to render`);
    e.code = "NOT_INSTALLED";
    e.status = 409;
    throw e;
  }
  const scen = SCENARIOS[scenario];
  if (!scen) {
    const e = new Error(`unknown test scenario "${scenario}" (have: ${Object.keys(SCENARIOS).join(", ")})`);
    e.code = "BAD_SCENARIO";
    e.status = 400;
    throw e;
  }

  const { customAlphabet } = require("nanoid");
  const jobId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10)();
  const b = scen.body;

  // Portrait, because that is the only aspect this generator strategy authors. Read from the
  // record so a future landscape-capable strategy needs no change here.
  const orientation = (record && record.orientation === "landscape") ? "horizontal" : "vertical";
  const quality = config.defaults?.quality || "720p";
  const dims = config.dimensionsFor(orientation, quality);

  db.insert({
    id: jobId,
    kind: "project",
    prompt: b.prompt || null,
    duration: b.duration,
    orientation,
    quality,
    width: dims.width,
    height: dims.height,
    fps: config.defaults?.fps || 30,
    // Both fields, deliberately. `frame_pack` is the column intake overwrites with the brief's
    // suggestion; `intent.preferences.framePack` below is the one frameSelectorAgent reads to
    // decide whether the choice was the USER'S — and only that reading survives the reroutes.
    framePack: slug,
    brandPalette: b.brandPalette || null,
    userAssets: null,
    voiceStyle: "auto",
    voiceoverEnabled: b.voiceover !== false,
    // Autopilot: a test render must run end to end without a human approving a script, or the
    // admin's "test" would silently park in script_review and look like a hang.
    autopilot: true,
    captionsEnabled: b.captions !== false,
    captionsConfig: null,
    render3d: false,
    composeMode: null,
    uploadPath: null,
    intent: {
      prompt: b.prompt || null,
      websiteUrl: b.websiteUrl || null,
      hasReferenceVideo: false,
      hasUserAssets: null,
      preferences: {
        duration: b.duration,
        orientation,
        voiceStyle: "auto",
        // THE PIN. A real pack id here makes frameSelectorAgent classify the choice as
        // `via === "user"`, which every reroute honours.
        framePack: slug,
      },
    },
    created_at: Date.now(),
    client_ip: "admin-template-test",
  });

  // Mark it as a template test so the admin UI can list it and normal project listings can be
  // told apart later. Written straight onto the raw record, which is how the rest of the
  // codebase attaches out-of-band fields to a job.
  try {
    const raw = db.getRaw(jobId);
    if (raw) {
      raw.admin_test = { templateSlug: slug, templateId: record && record.id, scenario, by: createdBy || null, at: Date.now() };
    }
  } catch { /* the annotation is disclosure, never a reason to fail the render */ }

  enqueueIntake(jobId);
  return { projectId: jobId, scenario, label: scen.label, framePack: slug };
}

// ---------------------------------------------------------------- outcomes
//
// READ THE TEST BACK. Starting a test render recorded a job id and nothing else — the outcome
// lived only in the jobs table, so the admin UI could show that a test was started but never
// whether it worked, and publishing could not require one. Every consumer of a template record
// calls this first, which is why it is a cheap in-memory read of db.js rather than a stored
// duplicate that could go stale.
//
// A job that has vanished from the store (the jobs file is pruned) is reported as "gone" rather
// than as a failure: absence of evidence is not evidence of a broken template.
function refreshTests(rec) {
  const tests = Array.isArray(rec && rec.tests) ? rec.tests : [];
  if (!tests.length) return { tests, lastTest: null };
  const resolved = tests.map((t) => {
    let job = null;
    try { job = db.get(t.projectId); } catch { /* store unavailable */ }
    if (!job) return { ...t, state: "gone" };
    // db.get() returns a SHAPED job — camelCase — not the raw row. Reading `video_url` here (the
    // column name) yielded undefined for every job, so a test render that succeeded reported as
    // "empty" and the publish gate that requires a passing test could never be satisfied by
    // anything. Verified against a real render: 124s, delivered, and reported as no video.
    return {
      ...t,
      state: job.status === "done" ? (job.videoUrl ? "done" : "empty") : job.status,
      videoUrl: job.videoUrl || null,
      stage: job.progress || null,
      error: job.error || null,
      framePackUsed: job.framePack || null,
    };
  });
  // The most recent test that reached a verdict — a queued one says nothing yet.
  const last = resolved.find((t) => ["done", "failed", "empty"].includes(t.state)) || resolved[0] || null;
  return { tests: resolved, lastTest: last };
}

// Did this template ever render a real film end to end? The publish gate's question.
//
// It asks about THIS version only: a test render is pinned to a slug, and a slug is a version, so
// a passing test on v1 says nothing about v2. `framePackUsed` is checked too — a job that got
// rerouted onto another pack (disclosed, but possible) is not evidence about this one.
function passingTestFor(rec) {
  const { tests } = refreshTests(rec);
  return tests.find((t) => t.state === "done" && (!t.framePackUsed || t.framePackUsed === rec.slug)) || null;
}

module.exports = { startTestRender, scenarioList, SCENARIOS, refreshTests, passingTestFor };
