// TEMPLATE SERVICE — the orchestration the admin routes call.
//
// Every long-running admin action lives here rather than in the router, for the same reason the
// project pipeline lives outside routes/projects.js: these run for minutes, they move files, and
// they have to leave the lifecycle record consistent whether they finish, fail, or the process
// dies halfway. A route handler is the wrong place to reason about that.
//
// THE ORDERING RULE THIS FILE ENFORCES: nothing becomes visible to users until every check has
// passed. The pack directory is moved into the published root as the LAST step of publishing,
// after QA, after the media exists, after the composition has been proven to build — because a
// move is the only step that is instantly visible and the only one that is hard to walk back.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../config");
const store = require("./store");
const lifecycle = require("./lifecycle");
const paths = require("./paths");
const emit = require("./emit");
const generator = require("./generator");
const baseline = require("./baseline");
const skinMeta = require("./skin_meta");
const testRender = require("./test_render");
const frameRegistry = require("../services/frame_registry");
const pipeline = require("../services/pipeline");

// Required lazily: both pull in headless-Chromium and ffmpeg machinery that no other admin
// action needs, and the router loads this module at boot.
const qa = () => require("./qa");
const media = () => require("./media");

// Progress is written onto the record so the SSE stream carries it with no second channel.
function step(id, label, pct) {
  store.update(id, { progress: label, progressPct: Math.max(0, Math.min(100, Math.round(pct))) });
}

// ---------------------------------------------------------------- generate

// DRAFT/GENERATED/FAILED -> GENERATING -> GENERATED (or FAILED).
//
// Runs detached: the route answers 202 and the admin watches the SSE stream. A generation is
// one heavy LLM call plus a compile plus a stills pass, which is far too long to hold a request
// open and exactly the shape the progress ladder in the UI was designed for.
// OPEN ISSUES ARE THE BRIEF.
//
// Reporting a defect and fixing it are one act from the admin's side — "this is wrong, sort it
// out" — but until this existed they were unrelated. store.openIssues had exactly two readers:
// the carry-forward in newVersion and a counter on the dashboard. An issue could be reported,
// carried onto three versions and never once reach the model, so recording it changed nothing
// about what came back. The tracker was a notepad.
//
// Severity orders the list because the model reads it as a priority, and a critical defect
// buried under three cosmetic ones gets treated as cosmetic.
function fixBriefFrom(rec) {
  const open = store.openIssues(rec);
  if (!open.length) return null;
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  const lines = [...open]
    .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
    .map((i) => {
      const out = [`- [${String(i.severity || "medium").toUpperCase()} · ${i.category || "other"}] ${i.title}`];
      if (i.detail) out.push(`  ${i.detail}`);
      if (i.suggestedFix) out.push(`  Suggested fix: ${i.suggestedFix}`);
      return out.join("\n");
    });
  return [
    "These defects were seen in a real film made with this template. Fix them, most severe first,",
    "and change nothing else:",
    ...lines,
  ].join("\n");
}

async function runGeneration({ id, feedback = null }) {
  const rec = store.get(id);
  if (!rec) throw Object.assign(new Error("template not found"), { code: "NOT_FOUND", status: 404 });

  // Typed feedback still leads — it is the more specific instruction — with the open issues
  // appended as the standing list rather than replaced by it.
  const brief = fixBriefFrom(rec);
  if (brief) feedback = feedback ? `${feedback}\n\n${brief}` : brief;

  store.transition(id, lifecycle.STATUS.GENERATING, { progress: "designing", progressPct: 5, error: null });

  try {
    // 1 — DESIGN. The model returns data; nothing is written yet.
    step(id, "Generating template", 10);
    const { spec, usage, laps } = await generator.generateSpec({
      name: rec.name,
      prompt: rec.prompt,
      // The record stores the PACK vocabulary; generateSpec takes the JOB vocabulary and maps
      // back. Round-tripping through the existing pair rather than adding a third.
      orientation: rec.orientation === "landscape" ? "horizontal" : "vertical",
      options: { ...(rec.options || {}), category: rec.category, description: rec.description, tags: rec.tags },
      // A VERSION CREATED TO FIX ANOTHER ONE IS ALWAYS A REVISION.
      //
      // This used to read `feedback ? rec.spec : null`, so newVersion carried the parent's design
      // across and generation then ignored it: pressing Generate on v2 designed a brand-new
      // template from the prompt, and "version 2" shared nothing with version 1 but its name.
      // A row with a parent is by definition an edit of that parent, so its spec is the thing
      // being revised whether or not the admin typed feedback this time.
      existingSpec: (feedback || rec.parentId) ? rec.spec : null,
      feedback,
      onProgress: (s) => step(id, s === "designing" ? "Generating template" : `Refining the design (${s})`, 15),
    });
    if (laps) console.log(`[templates] ${rec.slug}: design passed validation after ${laps} repair lap(s)`);

    // 2 — COMPILE. Spec -> skin module + pack.json + FRAME.md, into the DRAFT root.
    step(id, "Creating source files", 35);
    const out = emit.emitTemplate({ spec, slug: rec.slug, rootKind: "draft" });

    // 3 — VALIDATE. The one check nothing else performs: does the declared renderer actually
    // reach a composer module? A pack whose renderer does not resolve renders through the
    // generic scene-kit with no error and no log — a plausible video of the wrong design.
    step(id, "Validating template", 50);
    if (!pipeline.rendererResolves(out.pack.renderer)) {
      throw Object.assign(
        new Error(`the generated renderer "${out.pack.renderer}" does not resolve to a composer module — the template would silently render as the generic scene-kit`),
        { code: "RENDERER_UNRESOLVED" }
      );
    }
    // Prove it builds before claiming it was generated. Cheap (no browser, no ffmpeg) and it
    // catches a malformed look table immediately rather than at preview time.
    const mod = pipeline.composerModuleFor(out.pack.renderer);
    // Probe at the template's OWN aspect. Building a landscape template at 1080x1920 would
    // exercise the wrong half of every layout decision and prove nothing about the film the
    // template will actually make.
    const wide = (out.pack.orientation || spec.stage) === "landscape";
    const probe = mod.buildComposition({
      storyboard: JSON.parse(JSON.stringify(qa().QA_STORYBOARD)),
      dims: wide ? { width: 1920, height: 1080, fps: 30 } : { width: 1080, height: 1920, fps: 30 },
      framePack: rec.slug, captionCues: [], assets: [], brandSkin: null, seedKey: rec.slug,
    });
    if (!probe || !probe.indexHtml || probe.indexHtml.length < 2000) {
      throw Object.assign(new Error("the generated template produced an empty or near-empty composition"), { code: "EMPTY_COMPOSITION" });
    }

    // 4 — STILLS. The cheap preview tier: real frames of the real template, in seconds.
    step(id, "Generating thumbnail", 65);
    let stills = [];
    try {
      const r = await media().makeStills({ slug: rec.slug, count: 4 });
      stills = r.stills || [];
    } catch (e) {
      // A stills failure must not lose a good design. It is reported and the template stays
      // GENERATED — the publish gate will refuse it later if no media ever appears.
      console.warn(`[templates] ${rec.slug}: stills failed (${e.message.slice(0, 140)})`);
    }

    // A SHALLOW SMOKE PASS, RECORDED AS ONE. This runs the cheap tiers only (no browser, no
    // lint), which the QA module correctly treats as "could not verify" and therefore scores as
    // failures — so a perfectly good template comes back from generation reading something like
    // 66/100 FAIL. Storing that as `qa` would put a red score on the detail page for a template
    // nobody has actually tested yet, and the admin would be reacting to an artefact of which
    // tiers ran rather than to the design.
    //
    // So it lands in its own field. The `qa` panel shows only a real, deep, publish-grade report
    // — the kind the publish gate consults — and stays empty until the admin runs one.
    step(id, "Running quality checks", 80);
    let report = null;
    try { report = await qa().runTemplateQa({ slug: rec.slug, record: rec, deep: false }); }
    catch (e) { console.warn(`[templates] ${rec.slug}: post-generation smoke check skipped (${e.message.slice(0, 140)})`); }

    store.transition(id, lifecycle.STATUS.GENERATED, {
      spec,
      capabilities: emit.capabilitiesOf(out.pack),
      assetRequirements: emit.assetRequirementsOf(out.pack),
      audio: out.pack.audio,
      category: out.pack.category || rec.category,
      tags: out.pack.tags || rec.tags,
      description: rec.description || out.pack.vibe,
      stills,
      thumbnail: stills[0] || null,
      qaSmoke: report,
      // THE OLD DESIGN'S EVIDENCE DOES NOT DESCRIBE THE NEW ONE. A regenerate overwrites the spec
      // and the composer module, so a retained `qa` report left the detail page showing the
      // previous design's score, verdict and per-group bars — timestamped, and against a module
      // that no longer exists. Publishing was never at risk (runPublish re-runs QA fail-closed),
      // but the admin's decision about whether to bother re-running it was being made on a stale
      // number. Cleared here so the panel is honestly empty until QA is run against THIS design.
      qa: null,
      publishBlocking: null,
      usage,
      progress: "Ready for review",
      progressPct: 100,
    });
    return store.get(id);
  } catch (err) {
    console.error(`[templates] ${rec.slug}: generation failed — ${err.message}`);
    store.fail(id, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------- qa

// GENERATED/READY_TO_PUBLISH -> TESTING -> READY_TO_PUBLISH | GENERATED.
//
// A clean QA promotes; a blocking one drops back to GENERATED so the admin regenerates or
// edits. TESTING never promotes straight to PUBLISHED — publishing is always its own explicit
// act, which is the whole point of the lifecycle.
async function runQa({ id }) {
  const rec = store.get(id);
  if (!rec) throw Object.assign(new Error("template not found"), { code: "NOT_FOUND", status: 404 });

  store.transition(id, lifecycle.STATUS.TESTING, { progress: "Running quality checks", progressPct: 10, error: null });
  try {
    const report = await qa().runTemplateQa({ slug: rec.slug, record: rec, deep: true });
    const { ok } = qa().isPublishable(report);
    const to = ok ? lifecycle.STATUS.READY_TO_PUBLISH : lifecycle.STATUS.GENERATED;
    store.transition(id, to, { qa: report, progress: ok ? "Ready to publish" : "Quality issues found", progressPct: 100 });
    return { template: store.get(id), qa: report };
  } catch (err) {
    // A QA HARNESS CRASH IS NOT A PASS. Dropping back to GENERATED (rather than leaving it in
    // TESTING or promoting) keeps the template exactly where an unproven template belongs.
    console.error(`[templates] ${rec.slug}: QA failed to run — ${err.message}`);
    store.transition(id, lifecycle.STATUS.GENERATED, {
      qa: { score: 0, verdict: "fail", blocking: [{ id: "qa.harness", group: "rendering", detail: `the quality harness could not run: ${err.message}`, fix: "check that Chromium and ffmpeg are available on this host, then re-run QA" }], errors: [], warnings: [], passed: [] },
      progress: "Quality check could not run",
      progressPct: 100,
    });
    throw err;
  }
}

// ---------------------------------------------------------------- publish

// The cheap, synchronous pre-checks. Run before the route answers, so an obviously
// unpublishable template gets its reasons immediately instead of after a two-minute render.
function publishBlockers(rec) {
  const blocking = [];
  if (rec.status !== lifecycle.STATUS.READY_TO_PUBLISH) {
    blocking.push({ id: "lifecycle.status", detail: `the template is ${rec.status}; only a READY_TO_PUBLISH template can be published`, fix: "run QA and clear any blocking issues first" });
  }
  const dir = paths.dirForRootKind(rec.slug, lifecycle.rootKindFor(rec.status));
  for (const f of ["pack.json", "FRAME.md"]) {
    if (!fs.existsSync(path.join(dir, f))) blocking.push({ id: `source.${f}`, detail: `${f} is missing from the template directory`, fix: "regenerate the template" });
  }
  if (!fs.existsSync(paths.skinPath(rec.slug))) {
    blocking.push({ id: "source.composer", detail: "the composer module is missing", fix: "regenerate the template" });
  }
  if (paths.existsPublished(rec.slug)) {
    blocking.push({ id: "slug.taken", detail: `a published template directory already exists at frames/${rec.slug}`, fix: "archive the published version first, or publish this as a new version" });
  }
  if (!rec.name || !rec.description) {
    blocking.push({ id: "metadata.incomplete", detail: "the template needs a name and a description", fix: "fill them in on the detail page" });
  }
  // A renderer that does not resolve is the defect that produces a plausible film of the WRONG
  // design, silently. It is the one thing that must never reach the published root.
  if (!pipeline.rendererResolves(rec.renderer)) {
    blocking.push({ id: "renderer.unresolved", detail: `the renderer "${rec.renderer}" does not resolve to a composer module — this template would render as the generic scene-kit`, fix: "regenerate the template" });
  }
  // A REAL FILM, ONCE, BEFORE ANY USER GETS ONE.
  //
  // QA proves the template composes, lints and lays out under a fixture. It cannot prove the
  // template survives the actual pipeline — script, assets, narration, captions and the mix — and
  // that is where the defects this feature exists to catch have actually appeared. The test
  // render already existed and was purely advisory; nothing read its result, so a template could
  // be published having never made a film. It is now a precondition, per version.
  if (!testRender.passingTestFor(rec)) {
    const { lastTest } = testRender.refreshTests(rec);
    const why = !lastTest ? "no test render has been run for this version"
      : lastTest.state === "gone" ? "the test render's job record is no longer available"
        : `the last test render is ${lastTest.state}${lastTest.error ? ` (${String(lastTest.error).slice(0, 160)})` : ""}`;
    blocking.push({
      id: "test.passed",
      detail: `${why} — a template must make one real film before it can be published`,
      fix: "run a test render from this page and wait for it to finish",
    });
  }
  // A KNOWN-BROKEN DESIGN MUST NOT GO BACK OUT UNDER A NEW NUMBER.
  //
  // newVersion clones the parent byte-for-byte and carries its open issues, so the shortest path
  // — new version, test, QA, publish — passes every check above while shipping exactly the design
  // that was reported broken. QA cannot catch it: the clone is a faithful copy, so it scores
  // whatever the parent scored. Only the issue list knows.
  //
  // Severity decides, because it is the only signal about whether a defect is worth stopping for,
  // and critical/high are already the two the detail screen colours as alarms. Medium and low do
  // not block — a template with a known cosmetic nit is still better live than not.
  const severe = store.openIssues(rec).filter((i) => i.severity === "critical" || i.severity === "high");
  if (severe.length) {
    blocking.push({
      id: "issues.open",
      detail: `${severe.length} unresolved ${severe.length === 1 ? "issue" : "issues"} of critical or high severity: ${severe.map((i) => i.title).join("; ").slice(0, 240)}`,
      fix: "regenerate this version so the fix is applied, then mark the issues fixed — or lower their severity if they are not release-blocking",
    });
  }
  return blocking;
}

// READY_TO_PUBLISH -> PUBLISHED. Async: it produces the real poster + preview, which is a full
// Chromium render.
async function runPublish({ id }) {
  const rec = store.get(id);
  if (!rec) throw Object.assign(new Error("template not found"), { code: "NOT_FOUND", status: 404 });

  const blocking = publishBlockers(rec);
  if (blocking.length) {
    const e = new Error("cannot publish template");
    e.code = "PUBLISH_BLOCKED";
    e.status = 409;
    e.blocking = blocking;
    throw e;
  }

  store.update(id, { progress: "Running final quality checks", progressPct: 10, publishBlocking: null });

  // FINAL QA, FAIL-CLOSED. Deliberately re-run rather than trusting the stored report: the
  // template may have been regenerated since, and a stale pass is indistinguishable from a
  // fresh one on the record.
  let report;
  try {
    report = await qa().runTemplateQa({ slug: rec.slug, record: rec, deep: true });
  } catch (err) {
    const e = new Error(`the quality harness could not run, so this template cannot be cleared for publishing: ${err.message}`);
    e.code = "PUBLISH_BLOCKED";
    e.status = 409;
    e.blocking = [{ id: "qa.harness", detail: e.message, fix: "check that Chromium and ffmpeg are available on this host" }];
    store.update(id, { publishBlocking: e.blocking, progress: "Blocked", progressPct: 100 });
    throw e;
  }
  const verdict = qa().isPublishable(report);
  if (!verdict.ok) {
    store.update(id, { qa: report, publishBlocking: verdict.blocking, progress: "Blocked", progressPct: 100 });
    const e = new Error("cannot publish template");
    e.code = "PUBLISH_BLOCKED";
    e.status = 409;
    e.blocking = verdict.blocking;
    throw e;
  }

  // THE SHOP WINDOW. Produced here and only here — one full render per template, at the moment
  // it becomes real. `npm run test:pack-media` requires all three files with a matching
  // composition hash, so a published pack without them turns the test chain red.
  store.update(id, { qa: report, progress: "Generating preview", progressPct: 45 });
  let mediaOut = null;
  try {
    mediaOut = await media().makePackMedia({ slug: rec.slug });
  } catch (err) {
    const e = new Error(`the preview render failed, so this template cannot be published: ${err.message}`);
    e.code = "PUBLISH_BLOCKED";
    e.status = 409;
    e.blocking = [{ id: "media.render", detail: e.message, fix: "retry, or check ffmpeg and the hyperframes renderer on this host" }];
    store.update(id, { publishBlocking: e.blocking, progress: "Blocked", progressPct: 100 });
    throw e;
  }

  // Spec section 22: a template with no thumbnail or no preview is INCOMPLETE and must not
  // publish. Measured from disk, not from what the media step claims it wrote.
  const status = media().mediaStatus(rec.slug);
  const missing = [];
  if (!status.hasPoster) missing.push("thumbnail");
  if (!status.hasPreview) missing.push("preview video");
  if (!status.hasMediaJson) missing.push("media manifest");
  if (missing.length) {
    // The media step writes straight into the PUBLIC static root, so a publish that gets this
    // far and then fails would leave a withdrawn template's shop window fetchable. Take it back
    // down before reporting the failure.
    withdrawPublicMedia(rec.slug, "publish blocked on incomplete media");
    const e = new Error(`cannot publish template: missing ${missing.join(", ")}`);
    e.code = "PUBLISH_BLOCKED";
    e.status = 409;
    e.blocking = missing.map((m) => ({ id: `media.${m.replace(/\s+/g, "-")}`, detail: `the ${m} was not produced`, fix: "re-run publish; if it keeps failing, regenerate the template" }));
    store.update(id, { publishBlocking: e.blocking, progress: "Blocked", progressPct: 100 });
    throw e;
  }

  // THE MOVE. Everything above is reversible; this is the step that makes the template real,
  // so it is last. store.transition performs it and rolls it back if the record cannot be
  // written, so the filesystem and the lifecycle can never disagree about what is live.
  store.update(id, { progress: "Publishing", progressPct: 85 });
  try {
    store.transition(id, lifecycle.STATUS.PUBLISHED, {
      qa: report,
      thumbnail: mediaOut.posterUrl || status.posterUrl,
      previewVideo: mediaOut.previewUrl || status.previewUrl,
      publishBlocking: null,
      progress: "Published",
      progressPct: 100,
    });
  } catch (err) {
    // The move (or the record write behind it) failed, so this template is NOT published — but
    // its poster and preview are already sitting in the public static root. Same reasoning as
    // the missing-media branch above: withdraw them before surfacing the failure.
    withdrawPublicMedia(rec.slug, "publish failed at the commit step");
    throw err;
  }

  // Keep `npm test` honest, and teach the library's own generators about the pack. A newly
  // published pack adds two lines to the golden baseline (spliced, never re-baselined, so
  // unrelated drift is not absorbed) and one entry to film_skins/_metadata.json (without which
  // the next `npm run frames:gen` rebuilds it from defaults and erases its designed identity).
  addToLibraryBooks(store.get(id));

  retirePreviousVersions({ id });

  console.log(`[templates] PUBLISHED ${rec.slug} (v${rec.version}) — now visible to users`);
  return store.get(id);
}

// ---------------------------------------------------------------- unpublish / archive

// WITHDRAW THE SHOP WINDOW TOO, NOT JUST THE PACK.
//
// The poster and preview live in server/public/frames/<slug>/, which server.js serves through
// an UNAUTHENTICATED express.static mount — that is the whole point of them, they are the
// gallery's card art. Moving the pack directory out of frames/ therefore un-lists a template
// without un-publishing its media: /frames/<slug>/preview.mp4 stays fetchable at a guessable
// URL, forever, for a design somebody deliberately withdrew. Nothing else cleans it up either;
// store.remove() only runs on a hard delete.
//
// So every path that takes a template out of the public library also takes its media out.
// Best-effort: a leftover file is a leak worth logging, never a reason to refuse the withdrawal.
function withdrawPublicMedia(slug, why) {
  try {
    paths.safeRmDir(paths.packMediaDir(slug));
    console.log(`[templates] ${slug}: removed public poster/preview (${why})`);
  } catch (e) {
    console.warn(`[templates] ${slug}: could not remove public media (${why}): ${e.message} — /frames/${slug}/ may still be fetchable`);
  }
}

function unpublish({ id }) {
  const rec = store.get(id);
  if (!rec) throw Object.assign(new Error("template not found"), { code: "NOT_FOUND", status: 404 });
  store.transition(id, lifecycle.STATUS.READY_TO_PUBLISH, {
    progress: "Unpublished", progressPct: 100,
    // The stored URLs would 404 the moment the media is removed; clearing them keeps the record
    // honest rather than pointing the detail page at files that no longer exist.
    thumbnail: null, previewVideo: null,
  });
  withdrawPublicMedia(rec.slug, "unpublished");
  removeFromLibraryBooks(rec.slug);
  console.log(`[templates] UNPUBLISHED ${rec.slug} — no longer visible to users`);
  return store.get(id);
}

function archive({ id }) {
  const rec = store.get(id);
  if (!rec) throw Object.assign(new Error("template not found"), { code: "NOT_FOUND", status: 404 });
  // SUPERSEDED counts: its books were already cleaned when it was retired, so archiving one must
  // not try again, but archiving a LIVE version must.
  const wasPublished = rec.status === lifecycle.STATUS.PUBLISHED;
  store.transition(id, lifecycle.STATUS.ARCHIVED, { progress: "Archived", progressPct: 100, thumbnail: null, previewVideo: null });
  withdrawPublicMedia(rec.slug, "archived");
  if (wasPublished) removeFromLibraryBooks(rec.slug);
  return store.get(id);
}

// ---------------------------------------------------------------- versions

// A NEW VERSION IS A NEW ROW AND A NEW DIRECTORY, never an edit of the live one.
//
// The directory name is the primary key at eight independent sites (the registry, the manifest
// loader, the renderer id, the composer filename, public/frames/<slug>/, the golden baseline,
// every persisted job's frame_pack column, and the audio history ledger). Version-inside-a-
// directory would have to change all eight; sibling directories change none of them. v1 keeps
// serving users untouched while v2 is designed, tested and QA'd.
function newVersion({ id, createdBy, changes = "" }) {
  const rec = store.get(id);
  if (!rec) throw Object.assign(new Error("template not found"), { code: "NOT_FOUND", status: 404 });

  const version = store.nextVersion(rec.family);
  const slug = `${rec.family}-v${version}`;
  const created = store.create({
    slug,
    name: rec.name,
    family: rec.family,
    version,
    prompt: rec.prompt,
    options: rec.options,
    orientation: rec.orientation,
    description: rec.description,
    category: rec.category,
    tags: rec.tags,
    createdBy,
  });

  // Carry the previous design across so the first generation is a REVISION of it rather than a
  // fresh invention — "version 2" that shares nothing with version 1 is a different template.
  // `parentId` is what makes runGeneration treat rec.spec as the thing being revised; without it
  // the spec was carried and then ignored, because generation only fed `existingSpec` to the
  // model when feedback was supplied. That is why v2 used to come back as a different design.
  //
  // OPEN ISSUES COME TOO. They are the reason this version exists — a defect seen on v1 is the
  // brief for v2 — and they keep their original `fromVersion`, so v4 still shows a defect first
  // observed on v2. Resolved ones stay behind with the version that fixed them.
  const carried = store.openIssues(rec).map((i) => ({ ...i, id: crypto.randomUUID() }));
  store.update(created.id, {
    spec: rec.spec,
    parentId: rec.id,
    changes: String(changes || "").slice(0, 500),
    issues: carried,
    description: rec.description,
    capabilities: rec.capabilities,
    assetRequirements: rec.assetRequirements,
    audio: rec.audio,
  });

  // CLONE THE SOURCE, don't just point at it. A row with no files can be neither previewed nor
  // test-rendered, so "create a version to fix the defect" used to begin by regenerating the
  // design from the prompt — before the admin could even reproduce the defect. Copying the
  // parent's pack directory and composer module means v2 starts as a byte-exact, renderable copy
  // of what is live, and the admin changes it from there.
  //
  // The parent's files are READ, never written: paths.clonePack writes only into the new slug's
  // own draft directory and its own composer file. That is the §12 rule — the live version's
  // files are untouchable — enforced at the filesystem layer rather than by convention.
  let cloned = false;
  try {
    cloned = emit.clonePack({ fromSlug: rec.slug, fromRootKind: lifecycle.rootKindFor(rec.status), toSlug: slug });
  } catch (err) {
    console.warn(`[templates] ${slug}: could not clone ${rec.slug} (${err.message}) — the version starts empty and must be generated`);
  }
  if (cloned) {
    // The clone is real source, so the row belongs in GENERATED — the state whose actions are
    // preview / test / QA / regenerate, which is exactly what the admin does next. Nothing has to
    // register the new composer: composerModuleFor picks up a film_skins file written after boot.
    store.transition(created.id, lifecycle.STATUS.GENERATED, {
      progress: `Cloned from v${rec.version}`,
      progressPct: 100,
      // The clone inherits the design but NOT the verdict: QA ran against a different directory,
      // and a carried-over score would let a version publish on its parent's evidence.
      qa: null,
      publishBlocking: null,
      lastTest: null,
      tests: [],
    });
  }
  return store.get(created.id);
}

// ---------------------------------------------------------------- rollback
//
// SUPERSEDED -> PUBLISHED, for the version that was live before the current one.
//
// ORDER: promote the target FIRST, then demote the incumbent. The reverse leaves a window in
// which the family has no live version at all, and pack selection runs continuously — a job that
// resolved a pack in that window would fail to find it. A brief overlap is harmless by
// comparison: both directories hold complete, renderable packs.
//
// Rollback deliberately does NOT re-run QA or re-render the shop window. This version already
// passed both when it was published, its files have not changed since (nothing can write to a
// published or superseded pack), and an emergency action that takes four minutes is an emergency
// action nobody uses.
function rollback({ id, by = null }) {
  const target = store.get(id);
  if (!target) throw Object.assign(new Error("template not found"), { code: "NOT_FOUND", status: 404 });
  if (target.status !== lifecycle.STATUS.SUPERSEDED) {
    throw Object.assign(new Error(`only a SUPERSEDED version can be rolled back to; this one is ${target.status}`), { code: "ILLEGAL_TRANSITION", status: 409 });
  }
  // The same physical checks publishing makes, minus the ones about a design that has never been
  // live. A superseded pack whose files went missing must not be promoted into frames/.
  const dir = paths.dirForRootKind(target.slug, lifecycle.rootKindFor(target.status));
  for (const f of ["pack.json", "FRAME.md"]) {
    if (!fs.existsSync(path.join(dir, f))) {
      throw Object.assign(new Error(`cannot roll back: ${f} is missing from ${target.slug}`), { code: "ROLLBACK_BLOCKED", status: 409 });
    }
  }
  if (!fs.existsSync(paths.skinPath(target.slug))) {
    throw Object.assign(new Error(`cannot roll back: the composer module for ${target.slug} is missing`), { code: "ROLLBACK_BLOCKED", status: 409 });
  }
  if (!pipeline.rendererResolves(target.renderer)) {
    throw Object.assign(new Error(`cannot roll back: the renderer "${target.renderer}" no longer resolves to a composer module`), { code: "ROLLBACK_BLOCKED", status: 409 });
  }

  const incumbent = store.publishedOf(target.family);
  store.transition(target.id, lifecycle.STATUS.PUBLISHED, {
    progress: `Rolled back to v${target.version}`,
    progressPct: 100,
    publishBlocking: null,
  });
  addToLibraryBooks(target);

  if (incumbent && incumbent.id !== target.id) {
    supersede(incumbent, target, `rolled back to v${target.version}`);
  }
  console.log(`[templates] ROLLBACK ${target.family}: v${target.version} is live again${incumbent ? `, v${incumbent.version} superseded` : ""}${by ? ` (by ${by})` : ""}`);
  return { template: store.get(target.id), superseded: incumbent ? store.get(incumbent.id) : null };
}

// ---------------------------------------------------------------- version bookkeeping
//
// The three files outside the pack directory that decide whether the library's own tooling agrees
// a template exists. Publishing adds them and superseding takes them away, so `npm test` stays
// green across a version change and a regenerated pack.json cannot be built from the wrong
// version's metadata. Best-effort, exactly like publish: a bookkeeping failure is a tooling
// problem, never a reason to leave two versions live.
function addToLibraryBooks(rec) {
  try {
    const r = baseline.addPack(rec.slug);
    if (!r.changed) console.warn(`[templates] ${rec.slug}: golden baseline not updated — ${r.reason}`);
  } catch (e) { console.warn(`[templates] ${rec.slug}: golden baseline update failed: ${e.message}`); }
  try { skinMeta.addPack(rec.slug, rec.spec); }
  catch (e) { console.warn(`[templates] ${rec.slug}: skin metadata update failed: ${e.message}`); }
}

function removeFromLibraryBooks(slug) {
  try { baseline.removePack(slug); } catch (e) { console.warn(`[templates] baseline cleanup failed: ${e.message}`); }
  try { skinMeta.removePack(slug); } catch (e) { console.warn(`[templates] skin metadata cleanup failed: ${e.message}`); }
}

// Retire a live version because another one of its family went live. The pack directory moves
// back to the draft root (store.transition does it), which is what actually takes it out of the
// gallery; the row, its QA report, its issues and its media all stay.
//
// The public poster and preview are deliberately KEPT. Everything else that leaves frames/ has
// them withdrawn because it was withdrawn FOR CAUSE and would otherwise stay fetchable at a
// guessable URL forever — but a superseded version is last week's release, not a retraction, and
// keeping its media is what lets a rollback be instant instead of a four-minute re-render.
// ONE LIVE VERSION PER FAMILY. The step that makes versioning real: whichever version WAS live is
// retired the moment its replacement is, so users see exactly one "Kinetic Universe" and a job can
// never resolve onto a design that is being replaced.
//
// Nothing did this before — v1 stayed PUBLISHED, its directory stayed in frames/, and the gallery
// listed both versions under the same name. Called AFTER the new version is live, so the family is
// never momentarily without one; a failure here leaves two live rather than none, which is the
// safe direction and is logged loudly.
function retirePreviousVersions({ id }) {
  const rec = store.get(id);
  if (!rec) return [];
  const retired = [];
  for (const prev of store.publishedSiblings(rec.family, rec.id)) {
    try { retired.push(supersede(prev, rec, `replaced by v${rec.version}`)); }
    catch (e) { console.error(`[templates] could not supersede ${prev.slug}: ${e.message} — TWO versions of ${rec.family} are live`); }
  }
  return retired;
}

function supersede(rec, byRec, why) {
  store.transition(rec.id, lifecycle.STATUS.SUPERSEDED, {
    supersededBy: byRec ? byRec.id : null,
    progress: `Superseded by v${byRec ? byRec.version : "?"}`,
    progressPct: 100,
    publishBlocking: null,
  });
  removeFromLibraryBooks(rec.slug);
  console.log(`[templates] SUPERSEDED ${rec.slug} (v${rec.version}) — ${why}`);
  return store.get(rec.id);
}

module.exports = {
  runGeneration, runQa, runPublish, publishBlockers, unpublish, archive,
  newVersion, rollback, retirePreviousVersions,
};
