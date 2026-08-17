#!/usr/bin/env node
// ADMIN TEMPLATE SYSTEM — the regression guard.
//
// Covers the invariants that, if they broke, would be either invisible or catastrophic:
//
//   1. A draft is UNREACHABLE from every user-facing path. This is the one that matters most:
//      the audit found six independent paths that turn a directory in frames/ into a live,
//      user-selectable template, and only one of them is the gallery. A regression here means
//      an admin's half-finished work starts rendering in customers' films.
//   2. Publishing MOVES the pack and unpublishing moves it back — status alone never decides
//      visibility.
//   3. Path safety refuses traversal, reserved names and writes outside the allowlisted roots.
//   4. The lifecycle table forbids every shortcut into PUBLISHED.
//   5. A compiled template actually renders, and actually re-tints with a brand skin (the real
//      test of supportsBrandColors, as opposed to the declaration).
//   6. The golden baseline splice adds and removes exactly the lines it should.
//
// No server, no LLM, no network: the spec fixture is checked in below, so this runs in CI and
// on a laptop identically.
//
//   node scripts/test-admin-templates.js

const fs = require("node:fs");
const path = require("node:path");

const lifecycle = require("../src/templates/lifecycle");
const paths = require("../src/templates/paths");
const store = require("../src/templates/store");
const spec = require("../src/templates/spec");
const emit = require("../src/templates/emit");
const frameRegistry = require("../src/services/frame_registry");
const pipeline = require("../src/services/pipeline");
const service = require("../src/templates/service");

let failures = 0, checks = 0;
function ok(cond, label, detail) {
  checks++;
  if (cond) { console.log(`  ok   ${label}`); return true; }
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  return false;
}
function section(t) { console.log(`\n${t}`); }

// A deliberately distinctive slug so a leaked fixture is obvious in any listing.
const SLUG = "zzz-test-admin-template";

const FIXTURE = {
  label: "ZZZ Test Template",
  display: "Unbounded", displayFallback: "Georgia, serif",
  body: "Manrope", bodyFallback: "system-ui, sans-serif",
  mono: null, em: 0.55, titleLine: 1.02, titleSpace: "0",
  titlePreset: "rise", itemPreset: "pop",
  palette: { deep: "#0a0f2c", violet: "#3b2a72", cyan: "#4fd6ff", magenta: "#ff5ca8", paper: "#f4f2ff", ink: "#080a1c" },
  accents: ["cyan", "magenta", "violet"],
  groundKey: "deep", inkKey: "ink", paperKey: "paper", dark: true,
  ground: { kind: "linear", from: "violet", to: "deep", angle: 165 },
  look: {
    hook: { bg: "deep", fg: "paper", hi: "cyan", world: true, top: 900, size: 132, kicker: { v: "outline", c: "cyan" } },
    statement: { bg: "violet", fg: "paper", hi: "cyan", world: false, top: 620, size: 168 },
    feature: { bg: "paper", fg: "ink", hi: "violet", world: false, top: 260, size: 108, card: { v: "glow", bg: "ink", r: 26, glow: "cyan" }, chips: { v: "pill", colors: ["violet", "magenta"], text: "paper" } },
    montage: { bg: "deep", fg: "paper", hi: "cyan", world: false, top: 280, size: 104, tile: { bg: "violet", line: "paper", label: "paper", r: 22, labelSize: 29 } },
    stats: { bg: "violet", fg: "paper", hi: "cyan", world: true, top: 400, size: 104, cols: ["cyan", "paper", "magenta"], num: 176 },
    cta: { bg: "deep", fg: "paper", hi: "magenta", world: true, top: 910, size: 124, align: "left", btn: { v: "glow", bg: "cyan", c: "ink" }, logoShape: "circle" },
    app: { bg: "violet", fg: "paper", hi: "cyan", world: false, top: 400, size: 104, cardBg: "ink", line: "paper" },
  },
  cams: ["drop", "pushL", "zoomIn", "pushU", "pushR", "zoomOut"], camMul: 3, camOff: 2,
  mag: { x: 1, y: 0.55, rot: 0.7, skew: 0, zin: 0.42, zout: 0.34, driftX: 8, driftY: 6, driftZ: 0.045, slide: 0.24, inn: 0.24, out: 0.82 },
  ambient: 1.4, energy: 1.05, badge: "circle",
  icon: { shape: "bolt", stroke: true },
  world: { layers: [
    { kind: "glow", color: "cyan", cx: 0.78, cy: 0.28, r: 0.55, opacity: 0.28, speed: 0.9 },
    { kind: "stars", color: "paper", count: 18, opacity: 0.5, speed: 1.1 },
  ] },
  variants: { feature: "Typing", stats: "Ring" },
  strings: { brandName: "ZZZ Test" },
  vibe: "A checked-in fixture used only by scripts/test-admin-templates.js to prove the admin template pipeline compiles, renders and stays invisible until published. Deep indigo ground with one electric cyan accent and a magenta reserved for the close.",
  category: "Technology",
  tags: ["fixture", "test", "internal"],
  audio: {
    mood: "neutral test tone", archetype: "editorial", energy: "medium", tempo: "mid",
    style: ["cinematic", "electronic", "ambient"],
    musicKeywords: ["test one", "test two", "test three", "test four", "test five", "test six", "test seven", "test eight", "test nine", "test ten"],
    sfxPalette: { transition: "whoosh", ui: "soft-tap", reveal: "shimmer", data: "data-ping", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: true },
  },
  assets: { photoMod: "neutral test photography with even lighting and a shallow depth of field", iconStyle: "line", keywords: ["test one", "test two", "test three", "test four"], prefer: ["screenshot", "photo"] },
  frameMdBody: "Fixture pack for the admin template regression guard.\n\n## Palette\n\n| role | hex |\n|---|---|\n| deep | `#0a0f2c` |\n",
};

// Remove every artifact this script could have created, from any prior run too.
function cleanup() {
  try { const rec = store.getBySlug(SLUG); if (rec) { rec.status = lifecycle.STATUS.DRAFT; store.remove(rec.id); } } catch { /* nothing to clean */ }
  for (const p of [paths.draftDir(SLUG), paths.publishedDir(SLUG), paths.packMediaDir(SLUG), paths.workDir(SLUG)]) {
    try { paths.safeRmDir(p); } catch { /* never existed */ }
  }
  try { fs.rmSync(paths.skinPath(SLUG), { force: true }); } catch { /* never existed */ }
  try { require("../src/templates/baseline").removePack(SLUG); } catch { /* not present */ }
}

function main() {
  cleanup();

  // ---------------------------------------------------------------- 1. lifecycle
  // PUBLISHED has exactly TWO predecessors, and the second one is not a loophole: a SUPERSEDED
  // version is one that was already live and already passed every gate, and the only thing that
  // reaches it is a rollback. Every other path in stays closed — in particular nothing lets a
  // GENERATED or TESTING template skip the review it has not had.
  section("lifecycle — PUBLISHED is reachable only from READY_TO_PUBLISH or a rollback");
  const S = lifecycle.STATUS;
  const MAY_PUBLISH = new Set([S.READY_TO_PUBLISH, S.SUPERSEDED]);
  for (const from of lifecycle.ALL_STATUSES) {
    const allowed = lifecycle.canTransition(from, S.PUBLISHED);
    const shouldBe = MAY_PUBLISH.has(from);
    ok(allowed === shouldBe, `${from} -> PUBLISHED is ${shouldBe ? "allowed" : "refused"}`);
  }
  ok(!lifecycle.canDelete(S.SUPERSEDED), "a SUPERSEDED version cannot be deleted");
  ok(lifecycle.rootKindFor(S.SUPERSEDED) === "draft", "a SUPERSEDED version's pack leaves the public root");
  ok(lifecycle.actionsFor(S.PUBLISHED).includes("newVersion") && !lifecycle.actionsFor(S.PUBLISHED).includes("edit")
    && !lifecycle.actionsFor(S.PUBLISHED).includes("regenerate"),
    "a PUBLISHED version offers newVersion and NEITHER edit nor regenerate");
  ok(!lifecycle.canDelete(S.PUBLISHED), "a PUBLISHED template cannot be deleted");
  ok(!lifecycle.canDelete(S.ARCHIVED), "an ARCHIVED template cannot be deleted");
  ok(lifecycle.rootKindFor(S.PUBLISHED) === "published", "only PUBLISHED maps to the published root");
  for (const s of lifecycle.ALL_STATUSES.filter((x) => x !== S.PUBLISHED)) {
    ok(lifecycle.rootKindFor(s) === "draft", `${s} maps to the draft root`);
  }

  // ---------------------------------------------------------------- 2. path safety
  section("path safety — traversal, reserved names and out-of-root writes are refused");
  for (const bad of ["../evil", "..", "a/b", "AAA", "-lead", "trail-", "a", "film-x", "auto", "scene-kit", "a\u0000b"]) {
    ok(paths.slugError(bad) != null, `slug "${bad.replace(/\u0000/g, "\\0")}" is rejected`);
  }
  ok(paths.slugError("aurora-pitch-2") == null, 'slug "aurora-pitch-2" is accepted');
  let threw = false;
  try { paths.safeJoin(paths.DRAFT_ROOT, "..", "escaped"); } catch { threw = true; }
  ok(threw, "safeJoin refuses a traversal segment");
  threw = false;
  try { paths.assertWritable(path.join(paths.PUBLISHED_ROOT, "..", "server", "server.js")); } catch { threw = true; }
  ok(threw, "assertWritable refuses a path outside the allowlisted roots");
  threw = false;
  try { paths.safeRmDir(paths.DRAFT_ROOT); } catch { threw = true; }
  ok(threw, "safeRmDir refuses to remove a root itself");

  // ---------------------------------------------------------------- 3. spec validation
  section("spec — the cross-checks that catch a plausible-but-wrong design");
  ok(spec.validateSpec(FIXTURE).ok, "the fixture spec validates");
  const unreadable = JSON.parse(JSON.stringify(FIXTURE));
  unreadable.look.hook.fg = "violet"; // violet on deep: nowhere near 4.5:1
  ok(!spec.validateSpec(unreadable).ok, "unreadable body copy is rejected");
  const undefinedRole = JSON.parse(JSON.stringify(FIXTURE));
  undefinedRole.look.hook.hi = "nosuchrole";
  ok(!spec.validateSpec(undefinedRole).ok, "a look field naming an undefined palette role is rejected");
  const badFont = JSON.parse(JSON.stringify(FIXTURE));
  badFont.display = "Definitely Not A Bundled Face";
  ok(!spec.validateSpec(badFont).ok, "an unbundled font is rejected (it would silently substitute)");
  const alwaysWorld = JSON.parse(JSON.stringify(FIXTURE));
  for (const k of Object.keys(alwaysWorld.look)) alwaysWorld.look[k].world = true;
  ok(!spec.validateSpec(alwaysWorld).ok, "a template whose every beat draws the world is rejected");

  // MUSIC TERMS WITH NO CATALOGUE BEHIND THEM. The first two designed templates wrote evocative
  // phrases — "newsroom bed", "midnight bulletin", "ticker rhythm" — and published; the provider
  // AND-matches, those words return 0/1/0 tracks, and `npm test` went red on a repo-wide audio
  // gate that has nothing to do with the admin system. Refused at validation, the generator's
  // repair loop fixes it before anything reaches disk.
  const deadTerms = JSON.parse(JSON.stringify(FIXTURE));
  deadTerms.audio.musicKeywords = [...deadTerms.audio.musicKeywords, "newsroom bulletin"];
  const dt = spec.validateSpec(deadTerms);
  ok(!dt.ok && /newsroom/.test(dt.errors.join(" ")), "a music keyword the catalogue has nothing behind is rejected, by name", dt.errors.join("; ").slice(0, 120));
  const liveTerms = JSON.parse(JSON.stringify(FIXTURE));
  liveTerms.audio.musicKeywords = [...liveTerms.audio.musicKeywords, "driving percussion"];
  ok(spec.validateSpec(liveTerms).ok, "and a keyword whose words DO resolve passes");

  // ---------------------------------------------------------------- 4. emit + render
  // The record is created BEFORE the artifacts, which is the real order: the admin creates a
  // DRAFT, then generation compiles into it. store.create deliberately refuses a slug that
  // already has a directory on disk — that is what stops a generation overwriting one of the
  // 135 shipped packs — so emitting first would trip its own guard.
  section("emit — a spec compiles to a template that resolves, builds and wears a brand");
  const rec = store.create({ slug: SLUG, name: "ZZZ Test Template", prompt: "fixture", orientation: "portrait" });
  ok(rec.status === S.DRAFT, "a new template starts as DRAFT (never public)");
  ok(store.shape(rec).isPublic === false, "and reports itself as not public");
  const out = emit.emitTemplate({ spec: FIXTURE, slug: SLUG, rootKind: "draft" });
  ok(fs.existsSync(path.join(out.dir, "pack.json")), "pack.json written to the DRAFT root");
  ok(fs.existsSync(path.join(out.dir, "FRAME.md")), "FRAME.md written to the DRAFT root");
  ok(fs.existsSync(out.skinPath), "the composer module was written");
  ok(out.dir.startsWith(paths.DRAFT_ROOT), "the pack landed in the draft root, not the published one");
  ok(pipeline.rendererResolves(out.pack.renderer), "the renderer resolves to a composer (late registration works)");

  // THE DERIVED MANIFEST MUST SATISFY THE SCHEMA THE RENDER PATH READS IT WITH.
  //
  // This caught a real defect on the first live generation: templates/spec.js allowed an audio
  // enum value that PackManifestSchema did not, so the written pack.json was unreadable —
  // getManifest() is fail-soft and returned null, the composer got no manifest and emitted
  // nothing, and the failure surfaced as "0 stills" with the cause in a truncated warning. Any
  // future drift between the two schemas fails here instead.
  const frameManifest = require("../src/services/frame_manifest");
  const written = JSON.parse(fs.readFileSync(path.join(out.dir, "pack.json"), "utf8"));
  const parsed = frameManifest.PackManifestSchema.safeParse(written);
  ok(parsed.success, "the written pack.json satisfies PackManifestSchema",
    parsed.success ? "" : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  ok(frameManifest.getManifest(SLUG) != null, "getManifest() can actually read it back");
  ok((frameManifest.audioPaletteErrors(written.audio) || []).length === 0, "every sfxPalette cue names a real cue");

  const mod = pipeline.composerModuleFor(out.pack.renderer);
  const SB = { title: "Acme", durationSec: 12, scenes: [
    { id: "s1", start: 0, duration: 3, kind: "hook", purpose: "intro", headline: "Ship faster", subtext: "The developer cloud." },
    { id: "s2", start: 3, duration: 3, kind: "feature", purpose: "feature", headline: "One dashboard", onScreenText: ["Deploys", "Metrics"] },
    { id: "s3", start: 6, duration: 3, kind: "stat", purpose: "result", headline: "Deploy in 8 seconds", emphasis: "8s" },
    { id: "s4", start: 9, duration: 3, kind: "cta", purpose: "cta", headline: "Acme", emphasis: "Start free", subtext: "acme.dev" },
  ] };
  const dims = { width: 1080, height: 1920, fps: 30 };
  const plain = mod.buildComposition({ storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: SLUG, captionCues: [], assets: [], brandSkin: null, seedKey: "t" });
  ok(plain.indexHtml && plain.indexHtml.length > 20000, "it builds a substantial composition", `${plain.indexHtml ? plain.indexHtml.length : 0} bytes`);
  ok(plain.indexHtml.includes("__timelines"), "it registers a timeline (a blank video would not)");
  ok(!plain.indexHtml.includes("repeat:-1"), "it has no infinite repeat (which breaks deterministic capture)");
  const branded = mod.buildComposition({ storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: SLUG, captionCues: [], assets: [], brandSkin: { accents: ["#ff6a00", "#ffd400"], emphasis: ["#ff6a00", "#ffd400"], source: "default", provenance: "explicit" }, seedKey: "t" });
  ok(branded.indexHtml !== plain.indexHtml, "the composition CHANGES with a brand skin (supportsBrandColors is real, not declared)");

  // The world must be deterministic, or every seek paints a different frame and the video
  // flickers. Emitting the same spec twice has to produce byte-identical source.
  const again = emit.emitSkinModule(spec.validateSpec(FIXTURE).spec, SLUG);
  ok(again === fs.readFileSync(out.skinPath, "utf8"), "re-emitting the same spec is byte-identical (deterministic world geometry)");
  // Strip line comments first: the generated header explains that the world contains no
  // Math.random and no Date, and matching that sentence is not the same as matching code.
  const skinCode = fs.readFileSync(out.skinPath, "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  ok(!/Math\.random|new Date|Date\.now/.test(skinCode), "the generated module contains no Math.random/Date (seek-exact)");

  // ---------------------------------------------------------------- 5. draft invisibility
  section("draft invisibility — the invariant the whole feature rests on");
  ok(!frameRegistry.listPacks().includes(SLUG), "listPacks() (gallery, brief vocabulary, rotation, reroutes) does NOT list it");
  ok(frameRegistry.listDraftPacks().includes(SLUG), "listDraftPacks() does list it");
  ok(frameRegistry.resolvePack(SLUG) === null, "resolvePack() — used by BOTH create routes to validate an explicit pick — refuses it");
  ok(frameRegistry.resolveAnyPack(SLUG) === SLUG, "resolveAnyPack() (admin only) accepts it");
  ok(frameRegistry.packDir(SLUG) != null, "content still resolves, so it can be built and QA'd");
  const brief = require("../src/services/brief");
  if (typeof brief.recentlyUsedPacks === "function" || true) {
    // The brief offers every listPacks() entry to the auto-selection model; proving the draft is
    // absent from that list is proving it cannot be auto-chosen.
    ok(!frameRegistry.listPacks().includes(SLUG), "it cannot be proposed by the brief's auto-selection");
  }

  // ---------------------------------------------------------------- 6. store + publish move
  section("store — publishing MOVES the pack; status alone never decides visibility");
  let illegal = false;
  try { store.transition(rec.id, S.PUBLISHED); } catch (e) { illegal = e.code === "ILLEGAL_TRANSITION"; }
  ok(illegal, "DRAFT -> PUBLISHED is refused by the store, not just by the router");

  store.transition(rec.id, S.GENERATING);
  store.transition(rec.id, S.GENERATED);
  store.transition(rec.id, S.TESTING);
  store.transition(rec.id, S.READY_TO_PUBLISH);
  ok(!frameRegistry.listPacks().includes(SLUG), "still invisible at READY_TO_PUBLISH");

  store.transition(rec.id, S.PUBLISHED);
  ok(paths.existsPublished(SLUG), "publishing moved the directory into frames/");
  ok(!paths.existsDraft(SLUG), "and out of frames_draft/");
  ok(frameRegistry.listPacks().includes(SLUG), "it is NOW listed for users");
  ok(frameRegistry.resolvePack(SLUG) === SLUG, "and a user may now pick it explicitly");

  // THE SHOP WINDOW IS PUBLIC AND MUST BE WITHDRAWN WITH THE TEMPLATE.
  //
  // server/public/frames/<slug>/ is served by an UNAUTHENTICATED express.static mount, so
  // un-listing a pack without removing its media leaves /frames/<slug>/preview.mp4 fetchable at
  // a guessable URL forever — for a design somebody deliberately withdrew. Found by the
  // adversarial review of the media tier; guarded here.
  const mediaDir = paths.packMediaDir(SLUG);
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, "poster.jpg"), "x", "utf8");
  fs.writeFileSync(path.join(mediaDir, "preview.mp4"), "x", "utf8");
  ok(fs.existsSync(path.join(mediaDir, "preview.mp4")), "a published template has public media on disk");

  service.unpublish({ id: rec.id });
  ok(!paths.existsPublished(SLUG), "unpublishing moved it back out of frames/");
  ok(!frameRegistry.listPacks().includes(SLUG), "and it disappeared from the user-facing list");
  ok(!fs.existsSync(mediaDir), "and its PUBLIC poster/preview were withdrawn with it");
  ok(store.get(rec.id).previewVideo == null, "and the record no longer points at the removed preview");

  // ---------------------------------------------------------------- 7. golden baseline
  section("golden baseline — a publish splices exactly its own two lines");
  const baseline = require("../src/templates/baseline");
  const BASELINE_FILE = require("../scripts/golden-composers.js").BASELINE;
  const before = fs.existsSync(BASELINE_FILE) ? fs.readFileSync(BASELINE_FILE, "utf8") : null;
  if (before == null) {
    console.log("  skip golden baseline (no baseline file on disk)");
  } else {
    store.transition(rec.id, S.PUBLISHED);
    const add = baseline.addPack(SLUG);
    ok(add.changed && add.added === 2, "adds exactly 2 lines", JSON.stringify(add));
    const mid = fs.readFileSync(BASELINE_FILE, "utf8");
    ok(mid.split("\n").filter((l) => l.startsWith(SLUG)).length === 2, "both lines are for this pack");
    baseline.removePack(SLUG);
    ok(fs.readFileSync(BASELINE_FILE, "utf8") === before, "removing restores the file BYTE FOR BYTE");
    store.transition(rec.id, S.READY_TO_PUBLISH);
  }

  // THE OTHER FILE A PUBLISH HAS TO TOUCH, for the same reason and with the same round-trip.
  //
  // A FilmKit pack.json is DERIVED: gen-film-packs reads film_skins/_metadata.json for the
  // creative half. A published template with no entry there gets regenerated from DEFAULTS by
  // the next `npm run frames:gen` — its designed vibe, tags and audio silently replaced, with
  // nothing failing — and apply-audio-profiles reports it as unprofiled and falls back to the
  // neutral bed. Both were true of the first two templates this system published.
  section("skin metadata — a publish teaches the library's own generators about the pack");
  {
    const skinMeta = require("../src/templates/skin_meta");
    const metaBefore = fs.readFileSync(skinMeta.META_PATH, "utf8");
    const add = skinMeta.addPack(SLUG, FIXTURE);
    ok(add.changed, "publishing writes the entry", JSON.stringify(add));
    const entry = JSON.parse(fs.readFileSync(skinMeta.META_PATH, "utf8"))[SLUG];
    ok(entry && entry.audio && entry.vibe === FIXTURE.vibe && entry.frameMd === FIXTURE.frameMdBody,
      "the entry carries the creative half packFor() reads");
    // And the manifest that entry produces is the one the template actually shipped with — the
    // whole point: a regeneration must be a no-op, not a redesign.
    const gen = require("../scripts/gen-film-packs.js");
    const regen = gen.packFor({ slug: SLUG, module: paths.skinFileName(SLUG), label: FIXTURE.label }, entry);
    ok(JSON.stringify(regen.audio) === JSON.stringify(out.pack.audio)
      && regen.vibe === out.pack.vibe && JSON.stringify(regen.tags) === JSON.stringify(out.pack.tags),
      "so regenerating the pack reproduces it rather than replacing it with defaults");
    ok(skinMeta.removePack(SLUG).changed && fs.readFileSync(skinMeta.META_PATH, "utf8") === metaBefore,
      "and unpublishing restores the file BYTE FOR BYTE");
  }

  // ---------------------------------------------------------------- 7a. spec-declared boxes
  //
  // ONE SOURCE OF TRUTH FOR PICTURE GEOMETRY. Every generated template used to ship identical asset
  // boxes because they were hardcoded in film_beats — two 16:9 templates from unrelated briefs both
  // declared feature:2@851x528. A spec may now state its own as fractions of its stage.
  //
  // The guard is NOT that the number arrives. It is that the MANIFEST and the RENDER agree on it: a
  // contract advertising a box the composer does not draw is the exact defect that had six shipped
  // packs collecting, vision-scoring and crop-prepping assets for slots no film ever showed.
  section("spec boxes — the manifest and the film agree on one set of numbers");
  {
    const BSLUG = SLUG + "-box";
    const clean = () => {
      try { paths.safeRmDir(paths.draftDir(BSLUG)); } catch { /* none */ }
      try { fs.rmSync(paths.skinPath(BSLUG), { force: true }); } catch { /* none */ }
    };
    clean();

    const withBoxes = JSON.parse(JSON.stringify(FIXTURE));
    withBoxes.boxes = { feature: { w: 0.62, h: 0.40 }, montage: { h: 0.11 }, statement: { h: 0.34 } };
    ok(spec.validateSpec(withBoxes).ok, "a spec declaring its own boxes validates");

    // 0.62 x 0.40 of the 1080 x 1920 stage is a 670 x 768 PLATE; the picture inside it is that
    // less the card's 13px padding on each side, which is the number the asset planner needs.
    const bout = emit.emitTemplate({ spec: withBoxes, slug: BSLUG, rootKind: "draft" });
    const sl = bout.pack.media.slotsByRole;
    ok(sl.feature.width === 644 && sl.feature.height === 742, "the manifest reports the declared feature box, inset like the family default", sl.feature.width + "x" + sl.feature.height);
    ok(sl.how.height === 211, "the manifest reports the declared montage tile height", String(sl.how.height));
    ok(sl.context.height === 653, "the manifest reports the declared statement card height", String(sl.context.height));

    const shot = [{ path: "a.png", type: "image", ratio: 1.6, width: 900, height: 560, source: "website", kindHint: "screenshot", cdProminence: "hero", visionOk: true, cdScore: 0.9 }];
    const bhtml = pipeline.composerModuleFor(bout.pack.renderer).buildComposition({
      storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: BSLUG, captionCues: [], assets: shot, brandSkin: null, seedKey: "b",
    }).indexHtml;
    const plate = bhtml.match(/width:([0-9.]+)cqw;height:([0-9.]+)cqw;border-radius:[0-9.]+cqw;padding:/);
    const drewW = plate ? Math.round(plate[1] * 10.8) - 26 : 0;
    const drewH = plate ? Math.round(plate[2] * 10.8) - 26 : 0;
    ok(drewW === sl.feature.width && drewH === sl.feature.height,
      "and the FILM draws exactly that box — contract and render cannot disagree",
      "drew " + drewW + "x" + drewH + " vs contract " + sl.feature.width + "x" + sl.feature.height);
    clean();

    // THE SAME LAW ON THE OTHER STAGE. The 16:9 beats lay out ACROSS the frame, so the feature
    // card's width is a share of the row rather than a free number — a declared width becomes
    // that share. If this drifts, a landscape template advertises boxes its own layout ignores,
    // which is the failure the portrait half above exists to prevent, just harder to see.
    const wideBoxes = JSON.parse(JSON.stringify(FIXTURE));
    wideBoxes.stage = "landscape";
    for (const L of Object.values(wideBoxes.look)) L.top = Math.min(L.top, 620);
    wideBoxes.boxes = { feature: { w: 0.42, h: 0.34 }, montage: { h: 0.20 }, statement: { h: 0.30 } };
    ok(spec.validateSpec(wideBoxes).ok, "a landscape spec may declare boxes too");

    // The bands are per-stage: the landscape family DEFAULT height (0.49 of a 1080-tall frame) is
    // past the portrait ceiling, and a portrait card at 0.49 would run off the frame. One shared
    // band would have to be wrong for one of the two stages.
    const wideTooWide = JSON.parse(JSON.stringify(wideBoxes));
    wideTooWide.boxes.feature.w = 0.9;
    ok(!spec.validateSpec(wideTooWide).ok, "a portrait-sized feature width on a landscape stage is rejected, not clamped");
    const portraitTooTall = JSON.parse(JSON.stringify(withBoxes));
    portraitTooTall.boxes.feature.h = 0.55;
    ok(!spec.validateSpec(portraitTooTall).ok, "a landscape-sized feature height on a portrait stage is rejected");

    const wbout = emit.emitTemplate({ spec: wideBoxes, slug: BSLUG, rootKind: "draft" });
    const wsl = wbout.pack.media.slotsByRole;
    ok(wsl.feature.height === 367 && wsl.context.height === 324 && wsl.how.height === 216,
      "the landscape manifest reports the declared boxes against the 1920x1080 stage",
      `${wsl.feature.width}x${wsl.feature.height} / ${wsl.how.height} / ${wsl.context.height}`);

    const whtml = pipeline.composerModuleFor(wbout.pack.renderer).buildComposition({
      storyboard: JSON.parse(JSON.stringify(SB)), dims: { width: 1920, height: 1080, fps: 30 },
      framePack: BSLUG, captionCues: [], assets: shot, brandSkin: null, seedKey: "wb",
    }).indexHtml;
    const wcard = whtml.match(/width:100%;height:([0-9.]+)cqw;border-radius:[0-9.]+cqw;padding:/);
    const wdrewH = wcard ? Math.round(wcard[1] * 19.2) : 0;
    ok(wdrewH === wsl.feature.height,
      "and the 16:9 film draws that feature height",
      `drew ${wdrewH} vs contract ${wsl.feature.height}`);
    // The split that wraps THIS card, not the first wideRow in the document (the hook lays out
    // across the frame too, and its own lead would answer a question nobody asked).
    const wlead = wcard ? String(whtml.slice(0, wcard.index)).match(/flex:([0-9.]+) 1 0(?![\s\S]*flex:[0-9.]+ 1 0)/) : null;
    const wdrewW = wlead ? Math.round(wlead[1] * (1664 - 88)) : 0;
    ok(Math.abs(wdrewW - wsl.feature.width) <= 2,
      "and gives it that share of the row",
      `drew ${wdrewW} vs contract ${wsl.feature.width}`);
    clean();

    // The other half of the same law: declaring nothing must leave the 89 shipped packs' row alone.
    const pout = emit.emitTemplate({ spec: JSON.parse(JSON.stringify(FIXTURE)), slug: BSLUG, rootKind: "draft" });
    const psl = pout.pack.media.slotsByRole;
    ok(psl.feature.width === 910 && psl.feature.height === 562 && psl.how.height === 292 && psl.context.height === 430,
      "a spec with NO boxes keeps the engine defaults untouched",
      `${psl.feature.width}x${psl.feature.height} / ${psl.how.height} / ${psl.context.height}`);
    clean();
  }

  // ---------------------------------------------------------------- 7b. landscape stage
  //
  // THE 16:9 PATH, PROVEN THE SAME WAY THE 9:16 PATH IS. The engine authors both stages now
  // (film_stage.setStage + film_beats' WIDE layout family), and the failure this guards against
  // is subtle: a landscape skin that silently builds against the portrait stage produces a
  // plausible document whose every height is measured against the wrong axis.
  section("landscape stage — a 16:9 template builds against a 16:9 frame");
  const WSLUG = SLUG + "-wide";
  try { const r0 = store.getBySlug(WSLUG); if (r0) { r0.status = lifecycle.STATUS.DRAFT; store.remove(r0.id); } } catch { /* none */ }
  try { paths.safeRmDir(paths.draftDir(WSLUG)); } catch { /* none */ }
  try { fs.rmSync(paths.skinPath(WSLUG), { force: true }); } catch { /* none */ }

  const WIDE_SPEC = JSON.parse(JSON.stringify(FIXTURE));
  WIDE_SPEC.stage = "landscape";
  WIDE_SPEC.label = "ZZZ Test Wide";
  // Landscape tops live in a 1080-tall frame; the portrait fixture's 900/910 would be past the
  // ceiling, which is exactly what the cross-check now rejects.
  for (const [k, L] of Object.entries(WIDE_SPEC.look)) L.top = Math.min(L.top, 620);
  const wv = spec.validateSpec(WIDE_SPEC);
  ok(wv.ok, "the landscape fixture validates", wv.errors.join("; "));

  // A portrait-authored `top` on a landscape stage must be REFUSED, not silently clamped.
  const badTop = JSON.parse(JSON.stringify(WIDE_SPEC));
  badTop.look.hook.top = 1500;
  ok(!spec.validateSpec(badTop).ok, "a portrait-height `top` on a landscape stage is rejected");

  store.create({ slug: WSLUG, name: "ZZZ Test Wide", prompt: "fixture", orientation: "landscape" });
  const wout = emit.emitTemplate({ spec: WIDE_SPEC, slug: WSLUG, rootKind: "draft" });
  ok(wout.pack.orientation === "landscape", "the derived manifest declares orientation landscape");
  ok(wout.pack.media && wout.pack.media.stage && wout.pack.media.stage.width === 1920,
    "its media contract is measured against the 1920x1080 stage");
  ok(frameManifest.PackManifestSchema.safeParse(wout.pack).success, "the landscape pack.json validates");
  ok(frameManifest.packOrientation(WSLUG) === "landscape", "the registry reports it as landscape");
  ok(frameManifest.packFitsOrientation(WSLUG, "horizontal") === true, "it fits a horizontal job");
  ok(frameManifest.packFitsOrientation(WSLUG, "vertical") === false, "and does NOT fit a vertical job");

  const wmod = pipeline.composerModuleFor(wout.pack.renderer);
  const wbuilt = wmod.buildComposition({
    storyboard: JSON.parse(JSON.stringify(SB)), dims: { width: 1920, height: 1080, fps: 30 },
    framePack: WSLUG, captionCues: [], assets: [], brandSkin: null, seedKey: "w",
  });
  ok(wbuilt.indexHtml && wbuilt.indexHtml.length > 20000, "it builds a substantial 16:9 composition", `${wbuilt.indexHtml ? wbuilt.indexHtml.length : 0} bytes`);
  ok(wbuilt.indexHtml.includes("__timelines"), "the 16:9 composition registers a timeline");
  ok(/viewBox="0 0 1920 1080"/.test(wbuilt.indexHtml), "the world SVG uses the LANDSCAPE viewBox (the stage was actually adopted)");
  ok(JSON.parse(wbuilt.metaJson).width === 1920, "meta.json reports a 1920-wide film");
  // The portrait fixture must still report the portrait viewBox afterwards — i.e. the per-build
  // stage is genuinely reset and does not leak from one build into the next.
  const backToPortrait = mod.buildComposition({
    storyboard: JSON.parse(JSON.stringify(SB)), dims, framePack: SLUG, captionCues: [], assets: [], brandSkin: null, seedKey: "t",
  });
  ok(/viewBox="0 0 1080 1920"/.test(backToPortrait.indexHtml), "a portrait build AFTER a landscape build is still portrait (no stage leak)");
  ok(backToPortrait.indexHtml === plain.indexHtml, "and is byte-identical to the same build before it");

  try { const rw = store.getBySlug(WSLUG); if (rw) { rw.status = lifecycle.STATUS.DRAFT; store.remove(rw.id); } } catch { /* none */ }

  cleanup();

  // ---------------------------------------------------------------- 7c. versioning
  //
  // THE POST-PUBLISH FIX LOOP, which is the whole reason a published template is not frozen.
  //
  //   published v1  ->  new version  ->  v2 is a CLONE in its own directory  ->  v2 publishes
  //   ->  v1 is SUPERSEDED and leaves frames/  ->  rollback puts v1 back and retires v2
  //
  // Every step is asserted against the FILESYSTEM as well as the record, because the record is
  // metadata and the directory is what users actually see. The invariants that matter:
  // v1's files are never written to while v2 is being built, and exactly one version of a family
  // is ever in the published root.
  section("versioning — a published template can be fixed without touching what is live");
  {
    const FAM = `${SLUG}-fam`;
    const V2 = `${FAM}-v2`;
    const scrub = () => {
      for (const r of store.list().filter((t) => t.family === FAM)) {
        r.status = lifecycle.STATUS.DRAFT;
        try { store.remove(r.id); } catch { /* already gone */ }
      }
      for (const s of [FAM, V2]) {
        try { paths.safeRmDir(paths.draftDir(s)); } catch { /* none */ }
        try { paths.safeRmDir(paths.publishedDir(s)); } catch { /* none */ }
        try { fs.rmSync(paths.skinPath(s), { force: true }); } catch { /* none */ }
        try { require("../src/templates/baseline").removePack(s); } catch { /* none */ }
        try { require("../src/templates/skin_meta").removePack(s); } catch { /* none */ }
      }
    };
    scrub();

    // v1, walked to PUBLISHED through the real transitions (the render gates are proven above;
    // this section is about what happens to a version once it IS live).
    const r1 = store.create({ slug: FAM, name: "ZZZ Family", family: FAM, version: 1, prompt: "fixture", orientation: "portrait", description: "probe" });
    emit.emitTemplate({ spec: FIXTURE, slug: FAM, rootKind: "draft" });
    store.transition(r1.id, S.GENERATING);
    store.transition(r1.id, S.GENERATED, { spec: FIXTURE });
    store.transition(r1.id, S.TESTING);
    store.transition(r1.id, S.READY_TO_PUBLISH);
    store.transition(r1.id, S.PUBLISHED);
    ok(paths.existsPublished(FAM) && frameRegistry.listPacks().includes(FAM), "v1 is live and listed");

    // The defect an admin finds by watching a real film.
    store.addIssue(r1.id, { title: "Screenshot placeholder is too small in 9:16", category: "layout", severity: "high", suggestedFix: "600x450" });
    ok(store.openIssues(store.get(r1.id)).length === 1, "an issue can be recorded against the live version");

    const v2 = service.newVersion({ id: r1.id, createdBy: "guard@test", changes: "fix the screenshot box" });
    ok(v2.slug === V2 && v2.version === 2 && v2.parentId === r1.id, "a new version gets its own slug, number and parent link", `${v2.slug} v${v2.version}`);
    ok(store.get(r1.id).status === S.PUBLISHED && paths.existsPublished(FAM), "v1 is STILL live and untouched");
    ok(v2.status === S.GENERATED && paths.existsDraft(V2) && fs.existsSync(paths.skinPath(V2)),
      "v2 arrives as a CLONE with its own pack directory and composer — not an empty row", v2.status);
    ok(!paths.existsPublished(V2) && !frameRegistry.listPacks().includes(V2), "and the clone is invisible to users");
    ok(store.openIssues(v2).length === 1 && store.openIssues(v2)[0].fromVersion === 1,
      "the open issue came with it, still tagged as first seen on v1");
    const p2 = JSON.parse(fs.readFileSync(path.join(paths.draftDir(V2), "pack.json"), "utf8"));
    ok(p2.name === V2 && p2.renderer === `film-${V2}`, "the clone renamed itself so two versions never share a renderer id", `${p2.name}/${p2.renderer}`);
    ok(pipeline.rendererResolves(p2.renderer), "and the clone's renderer resolves to its own composer module");
    const p1 = JSON.parse(fs.readFileSync(path.join(paths.publishedDir(FAM), "pack.json"), "utf8"));
    ok(p1.renderer === `film-${FAM}`, "v1's live manifest was not rewritten by the clone");
    // The design carried across, which is what makes v2 a revision rather than a new template.
    ok(JSON.stringify(v2.spec) === JSON.stringify(store.get(r1.id).spec), "v2 starts from v1's design");

    // Publish v2 the same way runPublish does its final step, then retire the incumbent.
    store.transition(v2.id, S.TESTING);
    store.transition(v2.id, S.READY_TO_PUBLISH);
    store.transition(v2.id, S.PUBLISHED);
    const retired = service.retirePreviousVersions({ id: v2.id });
    ok(retired.length === 1 && retired[0].id === r1.id, "publishing v2 retires v1", `${retired.length} retired`);
    ok(store.get(r1.id).status === S.SUPERSEDED, "v1 is SUPERSEDED");
    ok(!paths.existsPublished(FAM) && paths.existsDraft(FAM), "and its directory has left the public root");
    ok(frameRegistry.listPacks().includes(V2) && !frameRegistry.listPacks().includes(FAM),
      "users now see exactly one version of the family");
    ok(store.publishedSiblings(FAM, null).length === 1, "the store agrees only one version is live");
    ok(store.get(r1.id).supersededBy === v2.id, "the superseded row records what replaced it");
    ok(!lifecycle.canDelete(S.SUPERSEDED), "a superseded version cannot be deleted — it is what a rollback restores");

    // v2 turns out to be worse. Roll back.
    const rb = service.rollback({ id: r1.id, by: "guard@test" });
    ok(rb.template.status === S.PUBLISHED && paths.existsPublished(FAM), "rollback puts v1 back in the public root");
    ok(store.get(v2.id).status === S.SUPERSEDED && !paths.existsPublished(V2), "and retires v2 rather than deleting it");
    ok(frameRegistry.listPacks().includes(FAM) && !frameRegistry.listPacks().includes(V2), "users see v1 again, and only v1");
    ok(service.rollback.length >= 0 && (() => { try { service.rollback({ id: r1.id }); return false; } catch { return true; } })(),
      "rolling back to a version that is already live is refused");

    // The dashboard rollup the admin reads.
    const fam = store.familySummary(FAM);
    ok(fam && fam.published && fam.published.version === 1 && fam.versionCount === 2 && fam.openIssues >= 1,
      "the family rollup reports the live version, the version count and the open issues",
      fam ? `v${fam.published.version} of ${fam.versionCount}, ${fam.openIssues} issue(s)` : "none");

    scrub();
    ok(!paths.existsAnywhere(FAM) && !paths.existsAnywhere(V2), "the versioning fixture left nothing behind");
  }

  // ---------------------------------------------------------------- 7d. the test-render pin
  //
  // THE ADMIN'S "TEST THIS TEMPLATE" MUST RENDER *THAT* TEMPLATE.
  //
  // It did not. frameSelectorAgent resolves an explicit pick with frameRegistry.resolvePack(),
  // which answers PUBLISHED-ONLY — the invariant this whole feature rests on — so a draft's slug
  // resolved to null, the job fell through to auto-selection, and the test rendered a different
  // template entirely. Three real test renders pinned to "hyperplane-ai" came back having rendered
  // grid-dispatch and daybreak-bakehouse; one of them succeeded, which is worse than failing.
  //
  // Nothing caught it because every layer was behaving correctly in isolation. What surfaced it was
  // the publish gate refusing to count a pass whose `framePackUsed` was another pack — so both
  // halves are asserted here: drafts resolve for an admin test, and a pass on another pack is not
  // evidence about this one.
  section("test render — an admin test of a DRAFT renders that draft, and evidence is pack-specific");
  {
    const rec2 = store.create({ slug: SLUG, name: "ZZZ Test Template", prompt: "fixture", orientation: "portrait", description: "d" });
    emit.emitTemplate({ spec: FIXTURE, slug: SLUG, rootKind: "draft" });
    ok(frameRegistry.resolvePack(SLUG) == null, "a draft is invisible to the user-facing resolver");
    ok(frameRegistry.resolveAnyPack(SLUG) === SLUG, "but the admin resolver reaches it — which is what the pin needs");

    const tr = require("../src/templates/test_render");
    const db = require("../src/db");
    const realGet = db.get;
    db.get = (id) => ({
      "t-right": { status: "done", videoUrl: "/videos/t-right.mp4", framePack: SLUG },
      "t-wrong": { status: "done", videoUrl: "/videos/t-wrong.mp4", framePack: "grid-dispatch" },
    })[id] || null;
    try {
      ok(tr.passingTestFor({ slug: SLUG, tests: [{ projectId: "t-wrong" }] }) == null,
        "a render that came back as ANOTHER pack is not evidence about this template");
      ok(tr.passingTestFor({ slug: SLUG, tests: [{ projectId: "t-right" }] }) != null,
        "a render that came back as THIS pack is");
      const withWrong = { ...store.get(rec2.id), tests: [{ projectId: "t-wrong" }] };
      ok(service.publishBlockers(withWrong).some((b) => b.id === "test.passed"),
        "so publishing is blocked on the strength of a test that rendered something else");
    } finally { db.get = realGet; }

    try { const r = store.getBySlug(SLUG); if (r) { r.status = lifecycle.STATUS.DRAFT; store.remove(r.id); } } catch { /* none */ }
    cleanup();
  }

  // ---------------------------------------------------------------- 8. cleanup proof
  section("cleanup");
  ok(!paths.existsAnywhere(SLUG), "the fixture left no pack directory behind");
  ok(!fs.existsSync(paths.skinPath(SLUG)), "the fixture left no composer module behind");
  ok(store.getBySlug(SLUG) == null, "the fixture left no lifecycle record behind");
  ok(!frameRegistry.listPacks().includes(SLUG), "and nothing leaked into the user-facing pack list");

  console.log(`\n${failures ? "FAILED" : "PASSED"} — ${checks - failures}/${checks} checks`);
  process.exit(failures ? 1 : 0);
}

// CLI only. Requiring this file must not run a test suite that creates and deletes
// directories — the same "executes on require" hazard that makes scripts/make-pack-preview.js
// dangerous to touch.
if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error("\nharness error:", err && err.stack ? err.stack : err);
    try { cleanup(); } catch { /* best effort */ }
    process.exit(1);
  }
}

module.exports = { FIXTURE, SLUG };
