// TEMPLATE QUALITY CHECK — the automated gate an admin-authored template must clear before
// it can be published (product spec §14).
//
// WHAT THIS IS. A composite of the checkers KEYFRAME already ships — the hyperframes lint,
// the headless runtime smoke, the WCAG contrast audit, the asset-render reconciliation, the
// media contract, the motion verifier, the brand-coverage scorer, the audio profile — run
// against a SYNTHETIC film built by the template's own composer, and reduced to one number
// plus a list of blocking defects. Nothing here re-implements a check that exists; every
// group below is a wrapper that supplies the inputs and INTERPRETS the answer.
//
// ────────────────────────────────────────────────────────────────────────────────────────
// THE ONE DESIGN RULE THAT MATTERS: THIS MODULE INVERTS FAIL-OPEN.
//
// Every checker it calls is fail-open by construction, and deliberately so — that is the
// house law for the SHARED render path, where a missing Chromium must never cost a paying
// user their video. Verified in each source:
//
//   runtime_check.js:71,73    no puppeteer-core / no chromium      -> { ok:true, skipped }
//   contrast_check.js:307,310 no chromium / no index.html          -> { ok:true, skipped }
//   contrast_check.js:426     ANY thrown error                     -> { ok:true, skipped }
//   validator.js:99           inspect output unparseable           -> { ok:true, skipped:true }
//   asset_render_check.js:163 audit threw                          -> renderStatus AUDIT_ERROR
//   brand_coverage.js:76      no html / no brand                   -> null
//   template_media.js:394     malformed media block                -> a DERIVED plan, silently
//   frame_manifest.js:349,362 checker module unavailable           -> "no errors"
//   audio_profile.js:62       unreadable manifest                  -> the NEUTRAL profile
//
// For a publish gate every one of those answers is a lie of omission. "I could not look" is
// not "I looked and it was fine", and the whole point of this gate is that a template which
// has not been PROVEN good does not become visible to every user of the product. So each
// wrapper below detects its checker's could-not-run signal and records a FAILED check with an
// explicit reason, and the reason is carried in `skipped[]` so an operator can tell a genuine
// defect ("the timeline never registered") from a missing tool ("no chromium") and fix the
// right thing. A blocking check that could not run blocks the publish.
//
// The consequence is intentional and worth stating plainly: on a box with no Chromium and no
// npx, NOTHING can be published. That is the correct failure. The shared render path is
// untouched — this module is only ever called from the admin publish gate.
// ────────────────────────────────────────────────────────────────────────────────────────
//
// WHERE IT WRITES. Only under paths.workDir(slug)/qa, and only through paths.safeWrite, so a
// template that misbehaves during QA cannot damage a composer, a route or another pack.
// The artifacts are left behind on purpose: WORK_ROOT sits outside jobsDir precisely so the
// janitor cannot sweep them out from under an admin who is reading the failure.

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");

const paths = require("./paths");
const frameRegistry = require("../services/frame_registry");
const frameManifest = require("../services/frame_manifest");
const { rendererResolves, composerModuleFor } = require("../services/pipeline");
const { validate } = require("../services/validator");
const { runtimeCheck, findChromium } = require("../services/runtime_check");
const { contrastCheck } = require("../services/contrast_check");
const { auditAssetRender, isAssetRenderFailure } = require("../services/asset_render_check");
const { resolveMediaPlan } = require("../services/template_media");
const { scoreBrandCoverage } = require("../services/brand_coverage");
const { verifyMotion } = require("../services/motion_planner");
const { resolveBrand } = require("../services/brand_kit");
const audioProfile = require("../services/audio_profile");

// ---------------------------------------------------------------- the check table

// GROUP WEIGHTS — how much of the 100 each group is worth. Ordered by how expensive the
// defect is to the finished film: a template that renders the wrong design or throws is
// worthless (RENDERING), one that shows nothing where a picture belongs is nearly so
// (ASSETS), a still frame reads as a broken video (ANIMATION), and a pack that ignores the
// brand or has no sound identity is a template that WORKS but does not earn its place.
const GROUP_WEIGHTS = Object.freeze({
  rendering: 30,
  assets: 20,
  animation: 15,
  layout: 15,
  brand: 10,
  audio: 10,
});

const GROUPS = Object.freeze(Object.keys(GROUP_WEIGHTS));

// `blocking:true` means a failure of this check refuses the publish outright, regardless of
// the score. Everything else lands in warnings[] and only moves the number. The split is the
// difference between "this template is broken" and "this template is thin".
function ck(id, group, blocking, fix) {
  return Object.freeze({ id, group, blocking, fix });
}

const CHECKS = Object.freeze([
  // ---- RENDERING: does this template produce a film at all, and the RIGHT film ----
  ck("renderer.resolves", "rendering", true,
    "The pack's `renderer` id does not reach a composer module. Check pack.json's renderer matches the generated film_skins file name (film-<slug> -> <slug with _>.js)."),
  ck("renderer.builds", "rendering", true,
    "buildComposition() threw on a plain 6-scene storyboard. Read the thrown message — this is a defect in the generated composer, not in the input."),
  ck("renderer.output", "rendering", true,
    "The composer returned an empty indexHtml or metaJson. A composition with no meta.json cannot be rendered by hyperframes."),
  ck("renderer.lint", "rendering", true,
    "`hyperframes lint` rejected the composition. Read stderr: the usual causes are overlapping clips on one track and a duration that disagrees with meta.json."),

  // ---- LAYOUT: measured in headless Chromium at the pack's own declared stage ----
  ck("layout.inViewport", "layout", true,
    "Copy extends past the frame edge (measured after every inner clipping container, so a cropped picture does not count). Composers must lay out in cqw against the stage; an absolute px size authored for another aspect is the usual cause."),
  ck("layout.noClippedText", "layout", true,
    "Text is clipped by its own container (scrollWidth/Height exceeds the box under a non-visible overflow). Give the copy a real measure or reduce the type scale."),
  // ONE FIXTURE IS NOT A TEST OF A TEMPLATE, IT IS A TEST OF A FIXTURE.
  //
  // Every check above measures the same 6-scene storyboard with the same 8 pictures, and every
  // defect reported from real films has been CONTENT-dependent: a headline that fits at 40
  // characters and overflows at 90, a wall of tiles that looks right with 8 assets and renders as
  // empty plates with 1. A template that only holds under the fixture is a template that fails on
  // the first real job whose copy is longer than Northwind's.
  //
  // So the layout probe runs twice more, against the two content shapes that actually break
  // designs. Blocking, because both produce a visibly broken film.
  ck("layout.longCopy", "layout", true,
    "Copy overflows or is clipped when the headlines are long. Real scripts are not fixture-length: fit the type (soloSize/fitLines) or give the copy block a real measure instead of assuming a short headline."),
  ck("layout.sparseAssets", "layout", true,
    "With only one picture available the composition still lays out for many — the unfilled placeholders render as empty tinted plates. Collapse the grid, or fall back to a single-plate layout, when the plan resolves fewer assets than slots."),
  ck("layout.orientation", "layout", false,
    "The composition renders at an aspect that disagrees with the pack's declared `orientation`. Either fix the composer's stage or correct the declaration."),
  ck("layout.frameFilled", "layout", false,
    "The frame is nearly empty at the sampled beats — the design does not fill the stage it declares."),

  // ---- ASSETS: the media contract, and whether pictures actually reach the screen ----
  ck("assets.mediaSchema", "assets", true,
    "pack.json's `media` block does not validate against template_media.MediaSchema, so the pack silently falls back to a derived plan."),
  ck("assets.planAuthored", "assets", true,
    "The pack declares no usable media contract, so template_media derives one. A published template must state its own slots (placeholders or slotsByRole)."),
  ck("assets.slotCount", "assets", true,
    "The media plan instantiates zero placeholders — this template can never show a picture."),
  ck("assets.oneCritical", "assets", false,
    "The plan does not resolve to exactly one critical placeholder. Every film has one most-important picture."),
  ck("assets.render", "assets", true,
    "Assets were handed to the composer and the composed HTML references none of them (or references files that do not exist) — the film would render text-only."),
  ck("assets.criticalFilled", "assets", true,
    "The critical placeholder's asset is not drawn anywhere in the composed HTML — the film's hero frame renders as an empty plate."),

  // ---- BRAND: proven by DIFFERENCE, not by a declared capability flag ----
  ck("brand.responds", "brand", true,
    "Building with a brand skin produced byte-identical HTML to building without one, so this template ignores brand colors. Thread brandSkin through brand_kit.resolveBrand, or declare brand.mode:\"off\" in pack.json if opting out is deliberate."),
  ck("brand.coverage", "brand", false,
    "None of the colors the branded composition paints are derived from the brand palette. Read this as a per-pack baseline, not a global floor."),
  // NOT BLOCKING, AND THE REASON MATTERS.
  //
  // This measures the composition after an ARBITRARY synthetic brand skin has been applied. That
  // is a useful signal and a bad gate: adversarial review deep-ran 12 shipped templates and this
  // check refused 8 of them — the flagship and both reference-exact ports included. A gate that
  // rejects two thirds of the library it is meant to protect is measuring the wrong thing, and
  // it would have refused every template this feature exists to publish.
  //
  // What it is wrong about: the pack's own authored palette is ALREADY gated, harder and
  // deterministically, by templates/spec.js crossCheck — 4.5:1 for body copy and 3:1 for display
  // type on every beat, refused at design time before a file is written. And at render time
  // brand_kit.resolveBrand nudges a real brand colour along the HSL L axis until it clears the
  // pack's contrast floor, dropping what it cannot save. So the authored case is proven and the
  // real-brand case is self-correcting; what remains here is one synthetic palette the pack was
  // never designed for. The main render path agrees — services/pipeline.js runs contrastGate as
  // a diagnostic and it is off by default.
  //
  // It stays in the report as a warning because a template that fails it across many samples is
  // genuinely fragile under branding, and that is worth an admin's attention before they publish.
  ck("brand.contrast", "brand", false,
    "Text fails WCAG AA against what is actually behind it once an arbitrary brand skin is applied. The authored palette is separately gated at design time, so this is a fragility signal rather than a defect — but a template that fails it widely will read poorly for some customers' brand colours."),

  // ---- ANIMATION: a still frame is a broken video ----
  ck("animation.timeline", "animation", true,
    "window.__timelines[\"vid\"] was never registered in headless Chromium, so the renderer has nothing to seek and the video comes out BLANK."),
  ck("animation.tweens", "animation", true,
    "The composition registers no GSAP tweens at all — every scene would render as a still frame."),
  ck("animation.noInfiniteRepeat", "animation", true,
    "repeat:-1 found. An infinite tween makes frame capture non-deterministic; give the loop a finite repeat count."),

  // ---- AUDIO: the pack's sound is declared the same way its look is ----
  ck("audio.profileManifest", "audio", true,
    "audio_profile.profileFor() resolves to NEUTRAL, which means the film's music is steered by the script's subject alone — the cause of \"every video sounds the same\". Author an `audio` block in pack.json."),
  ck("audio.musicKeywords", "audio", true,
    "Fewer than 10 musicKeywords. The query ladder needs a real vocabulary, authored calmest-first, or the no-voiceover rotation has nothing to reach for."),
  ck("audio.style", "audio", false,
    "Fewer than 3 `style` tags. Track ranking scores candidates against these."),
  ck("audio.archetype", "audio", false,
    "No `archetype`. It is provenance for the shared flavour pool the keywords were widened from."),
  ck("audio.sfxPalette", "audio", true,
    "audio.sfxPalette names a scene role or a cue the library cannot produce. Roles: transition|ui|reveal|data|cta|ambient; cues must exist in audio_cues.CUES."),
]);

const CHECK_BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

// ---------------------------------------------------------------- the fixture
//
// ONE SYNTHETIC FILM FOR EVERY TEMPLATE, so the score measures the DESIGN and never the copy.
// The shape is lifted from scripts/make-pack-media.js's Northwind fixture (its 5-beat spine,
// its field names) and widened to six beats so a full hook/feature/how/stat/quote/cta role
// spine instantiates — a media contract keyed by `slotsByRole` reports nothing for a role its
// storyboard never contains, which would read as a pack defect rather than a fixture one.
//
// It is COPIED rather than required. scripts/make-pack-media.js does export { FIXTURE, ... }
// behind a require.main guard, but it is a dev script that pulls services/renderer at module
// scope, and src/ requiring scripts/ inverts the dependency direction for one object literal.

const QA_STORYBOARD = Object.freeze({
  title: "Northwind",
  url: "northwind.app",
  durationSec: 24.5,
  scenes: [
    { id: "s1", start: 0, duration: 4, kind: "hook", purpose: "intro", headline: "Everything in one place", subtext: "The workspace your team actually opens.", emphasis: "New", kicker: "Introducing" },
    { id: "s2", start: 4, duration: 4, kind: "feature", purpose: "feature", headline: "One clear view", subtext: "Plans, work and hand-offs on a single surface.", onScreenText: ["Real-time", "Shared", "Simple"], kicker: "What it does" },
    { id: "s3", start: 8, duration: 4, kind: "feature", purpose: "how", headline: "Set up in a morning", subtext: "Import, invite, ship — in that order.", onScreenText: ["Import", "Invite", "Ship"], kicker: "How it works" },
    { id: "s4", start: 12, duration: 4, kind: "stat", purpose: "result", headline: "Six hours back a week", emphasis: "6h", subtext: "92% still use it after a year, rated 4.9 out of 5.", kicker: "By the numbers" },
    { id: "s5", start: 16, duration: 4, kind: "quote", purpose: "testimonial", headline: "The first tool nobody complained about", quote: "The first tool nobody complained about.", attribution: "Head of Operations", subtext: "Head of Operations", kicker: "Customers" },
    { id: "s6", start: 20, duration: 4.5, kind: "cta", purpose: "cta", headline: "Start with Northwind", emphasis: "Start free", subtext: "northwind.app", kicker: "Get started" },
  ],
});

// THE TWO CONTENT SHAPES THAT BREAK DESIGNS, derived from the fixture rather than authored
// separately so a change to the spine reaches both.
//
//   long copy   — every headline and subtext roughly doubled, which is an ordinary real script.
//                 This is where type fitting, line counts and fixed-height copy blocks fail.
//   one picture — the plan asks for eight and gets one. This is where a tile wall renders seven
//                 empty tinted plates, which reads as a broken video rather than a sparse one.
const LONG = {
  headline: (s) => `${s} — and everything that comes with it, without the busywork`,
  subtext: (s) => `${s} Teams that switched cut their weekly reporting time roughly in half within the first month, without changing how they already work.`,
};
const CONTENT_STRESS = Object.freeze([
  {
    id: "stress-long-copy",
    check: "layout.longCopy",
    label: "long copy",
    storyboard: () => ({
      ...QA_STORYBOARD,
      scenes: QA_STORYBOARD.scenes.map((s) => ({
        ...s,
        headline: s.headline ? LONG.headline(s.headline) : s.headline,
        subtext: s.subtext ? LONG.subtext(s.subtext) : s.subtext,
        onScreenText: Array.isArray(s.onScreenText) ? s.onScreenText.map((t) => `${t} and measurable`) : s.onScreenText,
      })),
    }),
    assets: (all) => all,
  },
  {
    id: "stress-one-asset",
    check: "layout.sparseAssets",
    label: "one picture",
    storyboard: () => JSON.parse(JSON.stringify(QA_STORYBOARD)),
    // The logo is kept: a film with one screenshot and a logo is the commonest real shape, and
    // dropping it would measure a case the pipeline does not produce.
    assets: (all) => {
      const logo = all.find((a) => a.role === "logo");
      const first = all.find((a) => a.role !== "logo");
      return [first, logo].filter(Boolean);
    },
  },
]);

// THE SYNTHETIC BRAND. Three hues no frame pack ships (checked against the 135 installed
// palettes): if any of these survives into the composed HTML, the brand reached the design
// rather than the diff being noise from a seeded rotation.
const QA_BRAND_SKIN = Object.freeze({
  accents: ["#ff2d95", "#00e5ff", "#7cff00"],
  emphasis: ["#ff2d95", "#00e5ff"],
});

const STAGE_BY_ORIENTATION = Object.freeze({
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
});

// The lifecycle store records an orientation in the product's vocabulary; the manifest uses
// the aspect's name. One normalizer so a record and a pack.json can never disagree.
const ORIENTATION_ALIASES = Object.freeze({
  vertical: "portrait", portrait: "portrait",
  horizontal: "landscape", landscape: "landscape", wide: "landscape",
  square: "square",
});
function normOrientation(v) { return ORIENTATION_ALIASES[String(v || "").toLowerCase()] || null; }

// ---------------------------------------------------------------- synthetic assets
//
// PNG, NOT SVG. Several composers reject `.svg` for a picture plate on purpose (bauhaus
// rejects it outright), so an SVG fixture measures those packs as drawing nothing at all —
// a fixture defect that reads exactly like a pack defect. scripts/test-frame-fill.js learned
// this the hard way and converts through `sharp`; encoding the PNG here instead keeps QA free
// of an optional native dependency that may not be installed on an admin box.
//
// The FILE is small (long edge capped) while the DESCRIPTOR carries the slot's true declared
// size — layout is driven entirely by the descriptor's width/height/ratio, and decoding a
// 1600x900 solid image in three browsers per QA run buys nothing.

const PNG_LONG_EDGE = 384;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// A neutral two-band placeholder: a light "chrome" strip over a mid-slate field. Desaturated
// on purpose — a stand-in with real color in it gets read as part of the pack's own palette,
// and 135 packs have 135 accents to clash with.
function placeholderPng(w, h) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  const bar = Math.max(1, Math.round(h * 0.18));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none — deterministic bytes, and it compresses fine on flat bands
    const [r, g, b] = y < bar ? [0xe6, 0xea, 0xef] : [0x9a, 0xa3, 0xad];
    for (let x = 0; x < w; x++) { raw[o++] = r; raw[o++] = g; raw[o++] = b; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Seat one synthetic picture in every fillable placeholder the plan declares, in the plan's
// own order with the critical slot first. This is what production does (asset_placement stamps
// `__placement.placeholderId`), and it is the only way "is the hero box empty?" can be asked of
// a synthetic build: a pool of pictures with no scene binding measures composers that seat by
// scene-id match as drawing nothing.
function seatSyntheticAssets(dir, plan, cap = 8) {
  const fillable = (plan.placeholders || []).filter((p) => p.kind !== "logos");
  const ordered = [...fillable].sort((a, b) =>
    (a.priority === "critical" ? 0 : 1) - (b.priority === "critical" ? 0 : 1));
  const assets = [];
  ordered.slice(0, cap).forEach((p, i) => {
    const ratio = p.width / p.height;
    const w = ratio >= 1 ? PNG_LONG_EDGE : Math.max(16, Math.round(PNG_LONG_EDGE * ratio));
    const h = ratio >= 1 ? Math.max(16, Math.round(PNG_LONG_EDGE / ratio)) : PNG_LONG_EDGE;
    const file = `qa-${i}.png`;
    paths.safeWrite(path.join(dir, file), placeholderPng(w, h));
    assets.push({
      path: file, type: "image",
      // The DECLARED size is the slot's, so the composer lays out against the box it authored.
      width: Math.round(p.width), height: Math.round(p.height), ratio: Math.round(ratio * 1000) / 1000,
      source: i % 2 ? "upload" : "website",
      kindHint: p.kind === "illustrations" || p.kind === "icons" ? "illustration" : (p.kind === "screenshots" ? "screenshot" : "photo"),
      cdProminence: p.priority === "critical" ? "hero" : "support",
      cdScore: Math.max(0.6, 0.95 - i * 0.04),
      visionOk: true,
      alt: "product interface",
      sceneId: p.sceneId,
      __placement: { placeholderId: p.id },
      __qaPlaceholderId: p.id,
      __qaPriority: p.priority,
    });
  });
  // Every composer draws a mark somewhere; a lockup beat with no logo measures as an empty
  // frame that is actually behaving correctly.
  paths.safeWrite(path.join(dir, "qa-logo.png"), placeholderPng(160, 160));
  assets.push({ path: "qa-logo.png", type: "image", width: 400, height: 400, ratio: 1, source: "website-brand", role: "logo", alt: "logo" });
  return assets;
}

// ---------------------------------------------------------------- headless layout probe
//
// Extracted from scripts/test-frame-fill.js, which cannot be required: that file runs its
// whole sweep in a bare `(async () => { … })()` at module scope (line 266), so requiring it
// would launch Chromium and walk the pack library as a side effect of loading this module.
// The measurement approach is its PROBE verbatim in spirit — a 64x64 occupancy grid marked by
// every text-bearing and media box, so a stack of six nested wrappers counts as one region of
// ink rather than six, plus the clipped-text and out-of-frame counters.

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".mp4": "video/mp4",
};

function serveDir(dir) {
  const rootResolved = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/" || p === "") p = "/index.html";
    const file = path.resolve(path.join(rootResolved, p));
    if (!file.startsWith(rootResolved)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; return res.end(); }
      res.setHeader("content-type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, close: () => { try { server.close(); } catch { /* noop */ } } })));
}

/* eslint-disable */
// Runs IN THE PAGE — fully self-contained, no closure over Node scope.
function LAYOUT_PROBE() {
  const FW = window.innerWidth, FH = window.innerHeight;
  const GX = 64, GY = 64, cw = FW / GX, chh = FH / GY;
  const ink = new Uint8Array(GX * GY);
  function mark(g, r) {
    const x0 = Math.max(0, Math.floor(r.left / cw)), x1 = Math.min(GX - 1, Math.floor((r.right - 0.01) / cw));
    const y0 = Math.max(0, Math.floor(r.top / chh)), y1 = Math.min(GY - 1, Math.floor((r.bottom - 0.01) / chh));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * GX + x] = 1;
  }
  function effOpacity(el) {
    let o = 1, n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      o *= parseFloat(cs.opacity || "1");
      if (o < 0.06) return 0;
      n = n.parentElement;
    }
    return o;
  }
  // The rect a viewer can actually SEE: the element's own box, intersected with every
  // ancestor that clips it. A full-bleed ancestor is skipped on purpose — that IS the frame,
  // and intersecting with it would make "runs off the edge" unmeasurable by definition.
  function visibleRect(el) {
    let box = { left: el.getBoundingClientRect().left, top: el.getBoundingClientRect().top, right: el.getBoundingClientRect().right, bottom: el.getBoundingClientRect().bottom };
    let n = el.parentElement;
    while (n && n.nodeType === 1 && n !== document.body) {
      const cs = getComputedStyle(n);
      const clips = cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible";
      if (clips) {
        const pr = n.getBoundingClientRect();
        const fullBleedAncestor = pr.width >= FW * 0.985 && pr.height >= FH * 0.985;
        if (!fullBleedAncestor) {
          box = {
            left: Math.max(box.left, pr.left), top: Math.max(box.top, pr.top),
            right: Math.min(box.right, pr.right), bottom: Math.min(box.bottom, pr.bottom),
          };
        }
      }
      n = n.parentElement;
    }
    return box;
  }
  let overflow = 0, overflowMedia = 0, clipped = 0;
  const overflowSamples = [], clipSamples = [];
  for (const el of document.querySelectorAll("body *")) {
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "DEFS") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > FW || r.top > FH) continue;
    if (effOpacity(el) === 0) continue;
    const isMedia = tag === "IMG" || tag === "CANVAS" || tag === "VIDEO";
    let ownText = "";
    for (const n of el.childNodes) if (n.nodeType === 3) ownText += n.nodeValue;
    ownText = ownText.replace(/\s+/g, " ").trim();
    if (!isMedia && !ownText) continue;
    // A full-bleed canvas or image is the pack's WORLD, not its composition: counting it
    // would score every atmospheric pack at 100% ink and flag its edges as overflow.
    const fullBleed = r.width >= FW * 0.985 && r.height >= FH * 0.985;
    if (!fullBleed) mark(ink, r);
    if (!isMedia) {
      const cs = getComputedStyle(el);
      if ((cs.overflow !== "visible" || cs.textOverflow === "ellipsis")
        && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) {
        clipped++;
        if (clipSamples.length < 3) clipSamples.push(ownText.slice(0, 40));
      }
    }
    // 3px of tolerance, matching test-frame-fill: sub-pixel layout rounding and a 1px hairline
    // rule sitting on the frame edge are not "outside the viewport".
    //
    // MEDIA AND TEXT ARE COUNTED SEPARATELY, because the same geometry means opposite things.
    // A picture 1173px wide bleeding 49px past a 1080px frame is `object-fit: cover` done by
    // hand — the crop is the design, and counting it would block essentially every pack in the
    // library (it is what cat-nap does on its lead plate). A HEADLINE hanging off the same edge
    // is copy the viewer never reads. So the blocking counter is the text one.
    const v = fullBleed ? null : visibleRect(el);
    if (v && (v.left < -3 || v.top < -3 || v.right > FW + 3 || v.bottom > FH + 3) && v.right > v.left && v.bottom > v.top) {
      if (isMedia) { overflowMedia++; } else {
        overflow++;
        if (overflowSamples.length < 3) {
          overflowSamples.push(`${tag.toLowerCase()}${el.id ? "#" + el.id : ""} ${JSON.stringify(ownText.slice(0, 28))} [${Math.round(v.left)},${Math.round(v.top)} ${Math.round(v.right - v.left)}x${Math.round(v.bottom - v.top)}]`);
        }
      }
    }
  }
  let n = 0;
  for (let i = 0; i < ink.length; i++) n += ink[i];
  return { ink: n / ink.length, overflow, overflowMedia, clipped, clipSamples, overflowSamples };
}
/* eslint-enable */

// Measure a composed job dir at `dims`, seeking to the middle of three beats. Returns null
// when the probe COULD NOT RUN — the caller turns that into a failed check, never a pass.
async function probeLayout(jobDir, dims, scenes, { timeoutMs = 60000 } = {}) {
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); }
  catch { return { unavailable: "puppeteer-core not installed" }; }
  const exe = findChromium();
  if (!exe) return { unavailable: "no chromium" };
  if (!fs.existsSync(path.join(jobDir, "index.html"))) return { unavailable: "no index.html to probe" };

  let browser = null, served = null;
  try {
    served = await serveDir(jobDir);
    browser = await puppeteer.launch({
      executablePath: exe, headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 160)));
    await page.setViewport({ width: dims.width, height: dims.height, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${served.port}/index.html`, { waitUntil: "load", timeout: timeoutMs });
    const hasTl = await page
      .waitForFunction(() => !!(window.__timelines && window.__timelines.vid), { timeout: Math.min(20000, timeoutMs) })
      .then(() => true).catch(() => false);
    if (!hasTl) return { unavailable: `the timeline never registered${pageErrors[0] ? ` — ${pageErrors[0]}` : ""}` };
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => { /* fonts are best-effort */ });

    // An opener, a mid-film beat and the close. Density and clipping are properties of the
    // DESIGN; sampling every scene triples the wall clock to move the numbers by under a point.
    const list = Array.isArray(scenes) ? scenes : [];
    const picks = [list[0], list[Math.floor(list.length / 2)], list[list.length - 1]].filter(Boolean);
    const rows = [];
    for (const sc of picks) {
      const t = Number(sc.start || 0) + Number(sc.duration || 0) * 0.55;
      await page.evaluate((time) => {
        const tl = window.__timelines.vid;
        tl.pause(); tl.seek(time, false);
        window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time } }));
      }, t);
      await new Promise((r) => setTimeout(r, 90)); // let GSAP flush the seek + canvas FX paint
      rows.push(await page.evaluate(LAYOUT_PROBE));
    }
    if (!rows.length) return { unavailable: "the storyboard had no beats to sample" };
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    return {
      ink: sum("ink") / rows.length,
      overflow: sum("overflow"),
      overflowMedia: sum("overflowMedia"),
      clipped: sum("clipped"),
      clipSamples: [...new Set(rows.flatMap((r) => r.clipSamples))].slice(0, 3),
      overflowSamples: [...new Set(rows.flatMap((r) => r.overflowSamples))].slice(0, 3),
      samples: rows.length,
      pageErrors,
    };
  } catch (e) {
    // NOT a pass. An exception here means the frame was never measured, and this module's
    // whole contract is that an unmeasured template is an unpublished one.
    return { unavailable: `probe error: ${String((e && e.message) || e).slice(0, 160)}` };
  } finally {
    try { if (browser) await browser.close(); } catch { /* noop */ }
    try { if (served) served.close(); } catch { /* noop */ }
  }
}

// ---------------------------------------------------------------- result recorder

class Recorder {
  constructor() { this.results = new Map(); }
  // First write wins: a phase that fails early must not be overwritten by a later
  // best-effort pass on the same id.
  set(id, ok, detail, skippedReason) {
    if (!CHECK_BY_ID.has(id)) throw new Error(`qa: unknown check id "${id}"`);
    if (this.results.has(id)) return;
    this.results.set(id, { ok: !!ok, detail: String(detail || "").slice(0, 400), skipped: skippedReason || null });
  }
  pass(id, detail) { this.set(id, true, detail, null); }
  fail(id, detail) { this.set(id, false, detail, null); }
  // THE INVERSION, in one place. A checker that could not run records a FAILED check whose
  // reason is the missing infrastructure — never a pass, and never silence.
  unchecked(id, reason) { this.set(id, false, `could not verify: ${reason}`, String(reason).slice(0, 200)); }
  uncheckedRest(reason) { for (const c of CHECKS) if (!this.results.has(c.id)) this.unchecked(c.id, reason); }
}

// ---------------------------------------------------------------- the run

/**
 * runTemplateQa({ slug, record, deep, signal })
 *   -> { score, verdict, blocking[], errors[], warnings[], passed[], groups, ranAt, durationMs, skipped[] }
 *
 * `deep:false` runs only the pure-JS tiers (build, media contract, brand difference, motion,
 * audio) and leaves every browser/CLI check UNVERIFIED — which, by the inversion above, means
 * those checks FAIL. A shallow report is a preview for the admin UI; it is never publishable,
 * and isPublishable() will say so with reasons rather than quietly waving it through.
 */
async function runTemplateQa({ slug, record = null, deep = true, signal = null } = {}) {
  const startedAt = Date.now();
  const rec = new Recorder();
  const aborted = () => !!(signal && signal.aborted);

  let fatal = null;
  try {
    const name = paths.assertSlug(slug || (record && record.slug));

    // Root-agnostic BY DESIGN: frame_registry.packDir resolves the published root first and
    // the draft root second, so a template that has never been published is checked through
    // exactly the same code path it will be served by afterwards. Publishing is a directory
    // move (paths.js), and QA must not be the thing that notices.
    const packDir = frameRegistry.packDir(name);
    if (!packDir) {
      rec.uncheckedRest(`no pack directory for "${name}" in either the published or the draft root`);
      return finish(rec, startedAt, name, { fatal: "pack directory not found" });
    }

    const manifest = frameManifest.getManifest(name) || {};
    const renderer = String(manifest.renderer || (record && record.renderer) || "");
    const declaredOrientation = normOrientation(manifest.orientation)
      || normOrientation(record && record.orientation);
    const stage = frameManifest.packStage(name)
      || (declaredOrientation && STAGE_BY_ORIENTATION[declaredOrientation])
      || STAGE_BY_ORIENTATION.landscape;
    const dims = { width: stage.width, height: stage.height, fps: 30 };

    // ---- scratch dirs (the ONLY place this module writes) ----
    const qaRoot = paths.safeJoin(paths.workDir(name), "qa");
    paths.safeRmDir(qaRoot);                       // a stale artifact reads as a fresh result
    const plainDir = paths.safeJoin(qaRoot, "plain");
    const brandDir = paths.safeJoin(qaRoot, "brand");
    fs.mkdirSync(paths.assertWritable(plainDir), { recursive: true });
    fs.mkdirSync(paths.assertWritable(brandDir), { recursive: true });

    // ======================================================== RENDERING: resolve + build
    const composer = rendererResolves(renderer) ? composerModuleFor(renderer) : null;
    if (!composer) {
      rec.fail("renderer.resolves", renderer
        ? `renderer "${renderer}" does not reach a composer module — the pack would silently render through the generic scene-kit`
        : "the pack declares no `renderer` in pack.json");
      rec.uncheckedRest("the template has no composer, so nothing downstream could be built or measured");
      return finish(rec, startedAt, name, { renderer, dims });
    }
    rec.pass("renderer.resolves", `renderer "${renderer}" resolves to a composer module`);

    // ======================================================== ASSETS: the media contract
    // Resolved BEFORE the build because the plan decides where the synthetic pictures sit.
    const mediaErr = frameManifest.mediaErrors(manifest.media);
    if (manifest.media && mediaErr) rec.fail("assets.mediaSchema", `pack.json media block is invalid: ${mediaErr}`);
    else if (!manifest.media) rec.fail("assets.mediaSchema", "pack.json declares no `media` block at all");
    else rec.pass("assets.mediaSchema", "the media block validates against MediaSchema");

    const plan = resolveMediaPlan({ pack: name, scenes: QA_STORYBOARD.scenes, dims, manifest });
    if (plan.source === "authored") rec.pass("assets.planAuthored", `the pack's own media contract instantiated ${plan.slotCount} slot(s)`);
    else rec.fail("assets.planAuthored", `the media plan is "${plan.source}", not "authored" — template_media had to derive the slots from the renderer family`);
    if (plan.slotCount > 0) rec.pass("assets.slotCount", `${plan.slotCount} placeholder(s)`);
    else rec.fail("assets.slotCount", "the plan instantiates no placeholders at all");
    if (plan.criticalCount === 1) rec.pass("assets.oneCritical", "exactly one critical placeholder");
    else rec.fail("assets.oneCritical", `${plan.criticalCount} critical placeholder(s) — expected exactly 1`);

    if (aborted()) { rec.uncheckedRest("the QA run was aborted"); return finish(rec, startedAt, name, { renderer, dims, plan }); }

    // ---- build the plain film ----
    const assets = seatSyntheticAssets(plainDir, plan);
    const buildArgs = (brandSkin) => ({
      storyboard: JSON.parse(JSON.stringify(QA_STORYBOARD)),
      dims, framePack: name, assets, captionCues: [], brandSkin, localized: null,
      seedKey: `template-qa-${name}`,
    });

    let plain = null;
    try {
      plain = composer.buildComposition(buildArgs(null));
      rec.pass("renderer.builds", "buildComposition() ran clean on a 6-scene storyboard with 8 pictures");
    } catch (e) {
      rec.fail("renderer.builds", `buildComposition() threw: ${String((e && e.message) || e).slice(0, 240)}`);
      rec.uncheckedRest("the composer threw, so nothing could be composed or measured");
      return finish(rec, startedAt, name, { renderer, dims, plan });
    }

    const indexHtml = String((plain && plain.indexHtml) || "");
    const metaJson = String((plain && plain.metaJson) || "");
    if (indexHtml.trim().length > 200 && metaJson.trim().length > 2) {
      rec.pass("renderer.output", `${indexHtml.length} bytes of HTML + ${metaJson.length} bytes of meta.json`);
    } else {
      rec.fail("renderer.output", `composer returned indexHtml=${indexHtml.length}B metaJson=${metaJson.length}B — a composition needs both`);
    }

    // Land the composed film on disk NOW, not at the lint step: a shallow (preview) run is the
    // one an admin reads while iterating on a generated composer, and it is worth far more with
    // an index.html they can open. Both writes prove their destination through safeWrite.
    paths.safeWrite(path.join(plainDir, "index.html"), indexHtml);
    paths.safeWrite(path.join(plainDir, "meta.json"), metaJson || "{}");

    // ======================================================== ASSETS: did they REACH the film
    const audit = auditAssetRender({ indexHtml, assets, jobDir: plainDir });
    if (!audit || audit.renderStatus === "AUDIT_ERROR") {
      rec.unchecked("assets.render", `the asset-render audit itself failed${audit && audit.error ? ` (${audit.error})` : ""}`);
    } else if (audit.renderStatus === "FAIL_NO_IMG_SUPPORT" && audit.shotsRendered > 0) {
      // auditAssetRender decides "this template can show pictures" from `/<img\b/` alone
      // (asset_render_check.js:106), which is true of every DOM composer and false of the WebGL
      // ones — flagship binds its plates as Three.js textures, so it reports NO_IMG_SUPPORT
      // while 8 of 9 asset paths are demonstrably referenced in the document. The audit's own
      // per-path reconciliation is the stronger evidence, so it wins here; the tag heuristic
      // only decides the verdict when NOTHING was drawn.
      rec.pass("assets.render", `${audit.shotsRendered} picture(s) are referenced in the composition without an <img> tag — this template draws through a canvas/WebGL path`);
    } else if (isAssetRenderFailure(audit)) {
      rec.fail("assets.render", `${audit.renderStatus}: ${audit.assetsRendered}/${audit.assetsCollected} asset(s) reached the HTML, ${audit.scenesWithAsset}/${audit.sceneCount} scene(s) show one`);
    } else {
      rec.pass("assets.render", `${audit.renderStatus}: ${audit.assetsRendered}/${audit.assetsCollected} asset(s) drawn across ${audit.scenesWithAsset}/${audit.sceneCount} scene(s)`);
    }

    // The hero box specifically. auditAssetRender counts the WHOLE film, so a composer that
    // draws six tiles and leaves the critical plate empty still reports PASS — which is the
    // precise defect "no empty required placeholder" names.
    const criticalAsset = assets.find((a) => a.__qaPriority === "critical");
    // A TYPOGRAPHIC PACK IS NOT A BROKEN ONE.
    //
    // Some packs are authored to show no photography at all — their Feature draws underlined
    // lines, their Montage draws label blocks, and the single picture in the whole film is the
    // CTA logo lockup. gen-film-packs writes exactly that contract for a skin declaring
    // `media: false` (requiredAssets screenshots 0 / productImages 0 / logos 1, one `logos`
    // placeholder). seatSyntheticAssets deliberately does not seat `logos` placeholders, so no
    // asset ever carries __qaPriority "critical" and this check reported "the plan declared no
    // fillable critical placeholder" — i.e. it failed a pack for being what it says it is.
    //
    // Measured: the sweep across all 135 installed packs flagged exactly two, serif-manifesto and
    // type-riot, and both are `SKIN.media === false`. A publish gate that cannot pass a correct
    // template is a gate nobody can use.
    //
    // The exemption is a POSITIVE declaration, not an absence: the contract must say it wants no
    // screenshots and no product images AND every placeholder it does declare must be a logo. A
    // pack that simply forgot to mark a critical slot still fails, because it will have declared
    // imagery it does not draw.
    const wantsNoImagery = (() => {
      const req = (plan && plan.requiredAssets) || (manifest && manifest.media && manifest.media.requiredAssets) || {};
      const imagery = Number(req.screenshots || 0) + Number(req.productImages || 0) + Number(req.illustrations || 0) + Number(req.icons || 0);
      const slots = (manifest && manifest.media && manifest.media.slotsByRole) || {};
      const declared = Object.values(slots);
      return imagery === 0 && declared.length > 0 && declared.every((s) => String(s && s.kind) === "logos");
    })();
    if (!criticalAsset && wantsNoImagery) {
      rec.pass("assets.criticalFilled", "this template is authored typographic — it declares no photographic slots and shows only the CTA logo lockup, so there is no critical picture to fill");
    } else if (!criticalAsset) {
      rec.fail("assets.criticalFilled", "the plan declared no fillable critical placeholder to seat a picture in");
    } else if (indexHtml.indexOf(criticalAsset.path) !== -1) {
      rec.pass("assets.criticalFilled", `the critical slot "${criticalAsset.__qaPlaceholderId}" draws its picture`);
    } else {
      rec.fail("assets.criticalFilled", `the critical slot "${criticalAsset.__qaPlaceholderId}" (scene ${criticalAsset.sceneId}) renders EMPTY — its asset is referenced nowhere in the HTML`);
    }

    // ======================================================== ANIMATION: static analysis
    const motion = verifyMotion({ plan: null, indexHtml, storyboard: QA_STORYBOARD });
    if (motion.totalTweens > 0) rec.pass("animation.tweens", `${motion.totalTweens} tween(s), ${motion.tweensPerScene} per scene${motion.staticScenes.length ? ` — but ${motion.staticScenes.length} scene(s) are static` : ""}`);
    else rec.fail("animation.tweens", "the composition registers no GSAP tweens — every scene renders as a still frame");
    const infinite = (motion.footguns || []).find((f) => /repeat:\s*-1/.test(f));
    if (infinite) rec.fail("animation.noInfiniteRepeat", infinite);
    else rec.pass("animation.noInfiniteRepeat", "no infinite (repeat:-1) tween");

    // ======================================================== BRAND: proven by DIFFERENCE
    //
    // A `supportsBrandColors` flag proves nothing — the composer either paints the brand or it
    // does not, and the only way to know is to build it twice and look. Same seedKey, same
    // storyboard, same assets: the ONLY variable is the skin, so any difference is the brand.
    const brandMode = String((manifest.brand && manifest.brand.mode) || "accents");
    let branded = null;
    try { branded = composer.buildComposition(buildArgs(QA_BRAND_SKIN)); }
    catch (e) { branded = null; rec.unchecked("brand.responds", `the branded build threw: ${String((e && e.message) || e).slice(0, 160)}`); }

    const brandedHtml = String((branded && branded.indexHtml) || "");
    if (branded) {
      if (brandMode === "off") {
        // A pack may opt out on purpose (a movement's own primary triad IS the design). That is
        // a declared contract, not an omission, so it passes — but it is stated in the detail.
        rec.pass("brand.responds", "pack.json declares brand.mode:\"off\" — this template deliberately does not take brand colors");
      } else if (brandedHtml && brandedHtml !== indexHtml) {
        rec.pass("brand.responds", `a brand skin changes the composed HTML (${Math.abs(brandedHtml.length - indexHtml.length)} byte delta) — brand colors reach the design`);
      } else {
        rec.fail("brand.responds", "building with and without a brand skin produced IDENTICAL HTML — this template ignores brand colors entirely");
      }
    }

    if (brandedHtml) {
      const ground = (manifest.surface && manifest.surface.ground)
        || (manifest.colors && (manifest.colors.ground || manifest.colors.paper || manifest.colors.bg))
        || "#0b1020";
      const resolvedBrand = resolveBrand(QA_BRAND_SKIN, { ground, contract: manifest.brand || null });
      const coverage = scoreBrandCoverage({ indexHtml: brandedHtml, resolvedBrand });
      if (!coverage) {
        rec.unchecked("brand.coverage", "the coverage scorer found no colors to measure in the composed HTML");
      } else if (coverage.brandColorCoverage > 0) {
        rec.pass("brand.coverage", `${coverage.brandColorCoverage}% of ${coverage.distinctColors} distinct painted colors are brand-derived (${coverage.brandColorsUsed} of them)`);
      } else if (brandMode === "off") {
        rec.pass("brand.coverage", "brand.mode:\"off\" — 0% coverage is the declared contract");
      } else {
        // A WARNING, never a blocker, and the caveat belongs in the detail. scoreBrandCoverage
        // matches within 24 channel-units of a resolved brand color, so a pack that TINTS the
        // brand into its own surfaces (cat-nap paints #f7a7cf from a #ff2d95 lead) reads 0 here
        // while being visibly on-brand. brand.responds is the authoritative capability test;
        // this number is a per-renderer baseline and a regression detector.
        rec.fail("brand.coverage", `0% of ${coverage.distinctColors} distinct painted colors match the resolved brand within tolerance — a pack that tints rather than paints the brand reads 0 here, so compare against this renderer's own baseline`);
      }
      // Write the branded build for the contrast audit below. Both files go through safeWrite,
      // which proves the destination is inside an allowlisted root before a byte is written.
      paths.safeWrite(path.join(brandDir, "index.html"), brandedHtml);
      paths.safeWrite(path.join(brandDir, "meta.json"), String((branded && branded.metaJson) || metaJson || "{}"));
      for (const a of assets) {
        try { fs.copyFileSync(path.join(plainDir, a.path), paths.assertWritable(path.join(brandDir, a.path))); }
        catch { /* a missing picture only softens the contrast backdrop */ }
      }
    } else {
      rec.unchecked("brand.coverage", "there was no branded build to measure");
    }

    // ======================================================== AUDIO: the pack's own sound
    const profile = audioProfile.profileFor(name);
    if (profile.source === "manifest") rec.pass("audio.profileManifest", `audio identity resolved from the manifest (${profile.energy}/${profile.tempo})`);
    else rec.fail("audio.profileManifest", `profileFor() resolved to "${profile.source}" — the pack declares no usable audio block, so music is steered by the script's subject alone`);
    const kw = (profile.musicKeywords || []).length;
    if (kw >= 10) rec.pass("audio.musicKeywords", `${kw} music keywords`);
    else rec.fail("audio.musicKeywords", `${kw} music keyword(s) — 10 or more are needed for the query ladder to widen without leaving the pack's genre`);
    const styles = (profile.style || []).length;
    if (styles >= 3) rec.pass("audio.style", `${styles} style tags`);
    else rec.fail("audio.style", `${styles} style tag(s) — 3 or more are needed to rank candidate tracks`);
    if (profile.archetype) rec.pass("audio.archetype", `archetype "${profile.archetype}"`);
    else rec.fail("audio.archetype", "no archetype declared");
    const paletteErrs = frameManifest.audioPaletteErrors(manifest.audio);
    const declaredPalette = Object.keys((manifest.audio && manifest.audio.sfxPalette) || {}).length;
    if (paletteErrs.length) rec.fail("audio.sfxPalette", `sfxPalette: ${paletteErrs.slice(0, 3).join("; ")}`);
    else if (!declaredPalette) rec.fail("audio.sfxPalette", "no sfxPalette declared — every cue falls back to the generic intent resolution");
    else rec.pass("audio.sfxPalette", `${declaredPalette} palette role(s), all naming real cues`);

    if (aborted()) { rec.uncheckedRest("the QA run was aborted"); return finish(rec, startedAt, name, { renderer, dims, plan, motion, audit }); }

    // ======================================================== the deep tiers
    if (!deep) {
      // Not a pass, and not silence. A shallow run is explicitly a preview: everything below
      // is left UNVERIFIED, which this module scores as failed.
      rec.uncheckedRest("not run (deep:false — this is a preview, not a publish-grade QA)");
      return finish(rec, startedAt, name, { renderer, dims, plan, motion, audit, deep: false });
    }

    // ---- hyperframes lint ----
    // The files are already on disk via safeWrite (above); validate() rewrites the identical
    // bytes with its own fs call and runs the lint. The duplicate write is deliberate: runLint
    // is not exported, and this feature's rule is that every write it performs is ASSERTED
    // against the allowlisted roots — so the assertion happens here rather than being assumed
    // inside a module this task may not modify.
    let lint = null;
    try { lint = await validate(plainDir, { indexHtml, metaJson: metaJson || "{}" }); }
    catch (e) { lint = { ok: false, code: -1, stderr: String((e && e.message) || e) }; }
    if (lint && lint.ok) {
      rec.pass("renderer.lint", "hyperframes lint passed");
    } else if (lint && lint.code === -1) {
      // npx/hyperframes could not be spawned at all. Distinguished from a real lint failure
      // because the fix is completely different — and it is still a FAIL, not a pass.
      rec.unchecked("renderer.lint", `hyperframes lint could not run: ${String(lint.stderr || "").slice(0, 160)}`);
    } else {
      rec.fail("renderer.lint", `hyperframes lint failed (exit ${lint && lint.code}): ${String((lint && (lint.stderr || lint.stdout)) || "").trim().slice(-260)}`);
    }

    if (aborted()) { rec.uncheckedRest("the QA run was aborted"); return finish(rec, startedAt, name, { renderer, dims, plan, motion, audit, lint }); }

    // ---- runtime: does the timeline actually register ----
    const runtime = await runtimeCheck(plainDir, { timeoutMs: 30000 });
    if (runtime.skipped) rec.unchecked("animation.timeline", runtime.skipped);
    else if (runtime.ok) rec.pass("animation.timeline", "window.__timelines[\"vid\"] registered in headless Chromium with no page errors");
    else rec.fail("animation.timeline", String(runtime.error || "the runtime smoke failed"));

    if (aborted()) { rec.uncheckedRest("the QA run was aborted"); return finish(rec, startedAt, name, { renderer, dims, plan, motion, audit, lint, runtime }); }

    // ---- layout: measured at the pack's OWN declared stage ----
    const layout = await probeLayout(plainDir, dims, QA_STORYBOARD.scenes);
    if (layout.unavailable) {
      for (const id of ["layout.inViewport", "layout.noClippedText", "layout.frameFilled"]) rec.unchecked(id, layout.unavailable);
    } else {
      if (layout.overflow === 0) {
        rec.pass("layout.inViewport", `no copy outside the ${dims.width}x${dims.height} frame across ${layout.samples} sampled beats`
          + (layout.overflowMedia ? ` (${layout.overflowMedia} picture bleed(s), which is a crop and not a defect)` : ""));
      } else {
        rec.fail("layout.inViewport", `${layout.overflow} text element(s) extend past the frame edge: ${layout.overflowSamples.join(" · ")}`);
      }
      if (layout.clipped === 0) rec.pass("layout.noClippedText", "no clipped or overflowing text");
      else rec.fail("layout.noClippedText", `${layout.clipped} text element(s) are clipped by their own container: ${layout.clipSamples.map((s) => JSON.stringify(s)).join(", ")}`);
      // 0.06 is well below the observed floor for a pack that adapts (test-frame-fill measures
      // the packs that DO adapt at 0.30-0.60 ink and the ones that do not at ~0.10). This is a
      // "the frame is essentially empty" tripwire, not a density opinion.
      if (layout.ink >= 0.06) rec.pass("layout.frameFilled", `${Math.round(layout.ink * 100)}% mean ink coverage`);
      else rec.fail("layout.frameFilled", `${Math.round(layout.ink * 100)}% mean ink coverage — the frame is nearly empty at the sampled beats`);
    }

    // ---- content stress: the same design, under the two content shapes that break designs ----
    //
    // This is already inside the deep tiers (a shallow run returned above with everything below
    // marked unverified), so each pass costs one build plus one headless probe (~2-4s) only on
    // the runs that decide a publish.
    if (!layout.unavailable) {
      for (const stress of CONTENT_STRESS) {
        if (aborted()) break;
        const dir = paths.safeJoin(qaRoot, stress.id);
        fs.mkdirSync(dir, { recursive: true });
        let built = null;
        try {
          built = composer.buildComposition({
            ...buildArgs(null),
            storyboard: stress.storyboard(),
            assets: stress.assets(assets),
          });
        } catch (e) {
          rec.fail(stress.check, `buildComposition() threw under ${stress.label}: ${String((e && e.message) || e).slice(0, 200)}`);
          continue;
        }
        paths.safeWrite(path.join(dir, "index.html"), String(built.indexHtml || ""));
        paths.safeWrite(path.join(dir, "meta.json"), String(built.metaJson || "{}"));
        // The seated pictures live in the plain build's directory; the probe serves this one, so
        // the same relative paths have to resolve here too.
        for (const a of assets) {
          try { fs.copyFileSync(path.join(plainDir, a.path), path.join(dir, a.path)); } catch { /* not a file-backed asset */ }
        }
        const probe = await probeLayout(dir, dims, stress.storyboard().scenes);
        if (probe.unavailable) { rec.unchecked(stress.check, probe.unavailable); continue; }
        const broken = probe.overflow + probe.clipped;
        if (broken === 0) {
          rec.pass(stress.check, `${stress.label}: no overflow and no clipped text across ${probe.samples} sampled beats`);
        } else {
          const detail = [
            probe.overflow ? `${probe.overflow} element(s) past the frame edge: ${probe.overflowSamples.slice(0, 3).join(" · ")}` : "",
            probe.clipped ? `${probe.clipped} clipped: ${probe.clipSamples.slice(0, 3).map((s) => JSON.stringify(s)).join(", ")}` : "",
          ].filter(Boolean).join("; ");
          rec.fail(stress.check, `${stress.label}: ${detail}`);
        }
      }
    } else {
      for (const stress of CONTENT_STRESS) rec.unchecked(stress.check, layout.unavailable);
    }

    if (aborted()) { rec.uncheckedRest("the QA run was aborted"); return finish(rec, startedAt, name, { renderer, dims, plan, motion, audit, lint, runtime, layout }); }

    // ---- orientation: what the composition CLAIMS vs what the pack DECLARES ----
    const declaredW = Number((/data-width="(\d+)"/.exec(indexHtml) || [])[1]) || dims.width;
    const declaredH = Number((/data-height="(\d+)"/.exec(indexHtml) || [])[1]) || dims.height;
    const builtAspect = declaredW / declaredH >= 1.2 ? "landscape" : (declaredW / declaredH <= 0.86 ? "portrait" : "square");
    if (!declaredOrientation) {
      rec.pass("layout.orientation", `the pack declares no orientation (aspect-agnostic); it composed ${declaredW}x${declaredH}`);
    } else if (builtAspect === declaredOrientation) {
      rec.pass("layout.orientation", `declared ${declaredOrientation}, composed ${declaredW}x${declaredH}`);
    } else {
      rec.fail("layout.orientation", `pack.json declares "${declaredOrientation}" but the composition root is ${declaredW}x${declaredH} (${builtAspect})`);
    }

    if (aborted()) { rec.uncheckedRest("the QA run was aborted"); return finish(rec, startedAt, name, { renderer, dims, plan, motion, audit, lint, runtime, layout }); }

    // ---- contrast, on the BRANDED build ----
    // The brand is where legibility breaks: a pack's own palette was art-directed against its
    // own ground, and an arbitrary brand accent is the colour nobody checked. Measuring the
    // plain build would audit the one case that was already designed.
    if (!brandedHtml) {
      rec.unchecked("brand.contrast", "there was no branded build to audit");
    } else {
      const contrast = await contrastCheck(brandDir, { samples: 4, timeoutMs: 90000 });
      if (contrast.skipped) rec.unchecked("brand.contrast", contrast.skipped);
      else if (contrast.ok) rec.pass("brand.contrast", `every sampled text element clears WCAG AA (${(contrast.all || []).length} measurements)`);
      else {
        const worst = (contrast.persistentFailures || []).slice(0, 3)
          .map((f) => `${f.selector} ${f.bestRatio}:1 (needs ${f.needed})`).join(" · ");
        rec.fail("brand.contrast", `${(contrast.persistentFailures || []).length} text element(s) never clear WCAG AA: ${worst}`);
      }
    }

    return finish(rec, startedAt, name, { renderer, dims, plan, motion, audit, lint, runtime, layout });
  } catch (e) {
    // A throw out of the harness is itself a "could not check": everything unrecorded fails.
    fatal = String((e && e.message) || e).slice(0, 300);
    rec.uncheckedRest(`the QA harness failed: ${fatal}`);
    return finish(rec, startedAt, String(slug || ""), { fatal });
  }
}

// ---------------------------------------------------------------- scoring

function finish(rec, startedAt, slug, context = {}) {
  const errors = [], warnings = [], passed = [], blocking = [], skipped = [];
  const groupTally = Object.fromEntries(GROUPS.map((g) => [g, { pass: 0, total: 0 }]));

  for (const c of CHECKS) {
    const r = rec.results.get(c.id) || { ok: false, detail: "could not verify: this check never ran", skipped: "never ran" };
    const tally = groupTally[c.group];
    tally.total++;
    const entry = { id: c.id, group: c.group, detail: r.detail };
    if (r.skipped) skipped.push({ id: c.id, reason: r.skipped });
    if (r.ok) {
      tally.pass++;
      passed.push(entry);
    } else if (c.blocking) {
      blocking.push({ id: c.id, group: c.group, detail: r.detail, fix: c.fix });
      errors.push(entry);
    } else {
      warnings.push(entry);
    }
  }

  const groups = {};
  let score = 0;
  for (const g of GROUPS) {
    const { pass, total } = groupTally[g];
    const gs = total ? Math.round((pass / total) * 100) : 100;
    groups[g] = { score: gs, weight: GROUP_WEIGHTS[g], passed: pass, total };
    score += (GROUP_WEIGHTS[g] * gs) / 100;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ANY blocking failure is "fail", whatever the number says. A template that scores 92 and
  // renders the wrong design is not 92% publishable — the score is for ranking near-misses
  // against each other, and the blocking list is what decides.
  const verdict = blocking.length ? "fail" : (warnings.length || score < 90 ? "warn" : "pass");

  return {
    slug,
    score,
    verdict,
    blocking,
    errors,
    warnings,
    passed,
    groups,
    skipped,
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    // Raw context an admin actually needs when a check fails — never re-derived by the caller.
    context: {
      renderer: context.renderer || null,
      dims: context.dims || null,
      deep: context.deep !== false,
      fatal: context.fatal || null,
      mediaPlan: context.plan
        ? { source: context.plan.source, slotCount: context.plan.slotCount, criticalCount: context.plan.criticalCount, aspect: context.plan.aspect }
        : null,
      assetRender: context.audit ? { renderStatus: context.audit.renderStatus, assetsRendered: context.audit.assetsRendered, scenesWithAsset: context.audit.scenesWithAsset, sceneCount: context.audit.sceneCount } : null,
      motion: context.motion ? { totalTweens: context.motion.totalTweens, tweensPerScene: context.motion.tweensPerScene, staticScenes: context.motion.staticScenes } : null,
      layout: context.layout && !context.layout.unavailable
        ? { ink: Math.round(context.layout.ink * 1000) / 1000, overflow: context.layout.overflow, overflowMedia: context.layout.overflowMedia, clipped: context.layout.clipped }
        : null,
    },
  };
}

/**
 * isPublishable(qaReport) -> { ok, blocking }
 *
 * THE GATE ITSELF, and the one function in this feature that must never guess. A missing,
 * malformed or shallow report is not an absence of evidence to be waved through — it is the
 * absence of the evidence publishing REQUIRES, so it answers false with a stated reason.
 */
function isPublishable(qaReport) {
  const deny = (id, detail, fix) => ({ ok: false, blocking: [{ id, group: "rendering", detail, fix }] });
  if (!qaReport || typeof qaReport !== "object") {
    return deny("qa.missing", "no QA report — run the quality check before publishing", "POST /api/admin/templates/:id/qa");
  }
  if (!qaReport.ranAt) {
    return deny("qa.malformed", "the QA report carries no ranAt timestamp, so it cannot be trusted as a real run", "Re-run the quality check.");
  }
  if (qaReport.context && qaReport.context.deep === false) {
    return deny("qa.shallow", "this is a preview-tier QA report (deep:false); the browser and lint tiers never ran", "Re-run the quality check with deep:true.");
  }
  const blocking = Array.isArray(qaReport.blocking) ? qaReport.blocking : [];
  if (blocking.length) return { ok: false, blocking };
  // Belt and braces: a report whose verdict disagrees with its own empty blocking list is a
  // corrupted report, and a corrupted report is a refusal.
  if (qaReport.verdict === "fail") {
    return deny("qa.failed", "the QA report's verdict is \"fail\" with no blocking list — the report is inconsistent", "Re-run the quality check.");
  }
  return { ok: true, blocking: [] };
}

module.exports = { runTemplateQa, isPublishable, CHECKS, GROUP_WEIGHTS, QA_STORYBOARD };
