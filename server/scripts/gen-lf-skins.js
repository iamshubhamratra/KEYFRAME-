#!/usr/bin/env node
// GEN-LF-SKINS — regenerate the long-form pack skins from the handoff source.
//
// The long-form handoff (templete-design/longform-handoff) ships 28 five-minute 16:9 films.
// Twenty-seven of them are `LFKit.make(cfg)` calls against one shared kit (engine/lf-kit.js);
// the twenty-eighth, Field Notes, predates the kit and is a bespoke 98KB component with no
// LFKit reference at all, so it is out of scope here.
//
//   node scripts/gen-lf-skins.js            # write every skin
//   node scripts/gen-lf-skins.js --check    # verify on-disk skins match the source
//   node scripts/gen-lf-skins.js fetch-club [more...]   # a subset
//
// This is the sibling of gen-film-skins.js and deliberately mirrors it — same vm sandbox, same
// verbatim `Function.prototype.toString` carriage for the authored functions, same --check
// byte-compare. Three things differ, each for a measured reason:
//
//   1. SLUGS COME FROM pages/, NOT standalone/. gen-film-skins.js reads its slug table out of
//      `standalone/*.html`, and that directory was never tracked in git — which is why
//      `npm run test:film-skins` has been printing SKIPPED and exiting 0 for the entire life of
//      the FilmKit packs, verifying nothing. `pages/*.dc.html` is 28 files and ~290KB, it is the
//      editable source of record, and it carries the authored deck this generator also needs for
//      the spine. Deriving from it makes the check reproducible from a clean checkout.
//
//   2. AN ABSENT SOURCE IS A HARD ERROR IN BOTH MODES. gen-film-skins.js stands down politely
//      when it cannot find its handoff, on the reasoning that the drop is an untracked authoring
//      input. That reasoning produced a permanently green, permanently vacuous guard. The
//      long-form drop is expected to be committed, so absence here means something is wrong and
//      says so in both modes rather than quietly claiming success.
//
//   3. THE SKIN CARRIES NO `look` TABLE, BECAUSE LFKIT HAS NONE. FilmKit put per-beat appearance
//      in the cfg (a bg/fg/hi triple per archetype). Measured across all 30 LFKit cfgs, `look` is
//      absent from every one: the per-scene ground lives inside each of the 60 renderers in
//      lf-kit.js instead, and every palette returns the same six roles. So a skin is identity +
//      type + the six-role palette + the garnish voice + the camera pack + the World, and the
//      spine (which renderer runs at which index) is engine data plus a small override list.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "..", "src", "services", "lf_skins");

// Same candidate-list shape as the FilmKit generator: env override first, then the places the
// drop has actually lived. Resolve rather than hardcode — the sibling library has moved once
// already (templete-design/ -> old-templete/) and will move again.
const HANDOFF_CANDIDATES = [
  process.env.KEYFRAME_LF_HANDOFF || "",
  path.join(ROOT, "templete-design", "longform-handoff"),
  path.join(ROOT, "old-templete", "longform-handoff"),
  path.join(ROOT, "old-template", "longform-handoff"),
].filter(Boolean);

function resolveHandoff() {
  for (const dir of HANDOFF_CANDIDATES) {
    try { if (fs.statSync(path.join(dir, "engine", "lf-kit.js")).isFile()) return dir; } catch { /* next */ }
  }
  return null;
}
const HANDOFF = resolveHandoff();
const MISSING_MSG =
  `no long-form handoff source found. Looked for engine/lf-kit.js in:\n  ${HANDOFF_CANDIDATES.join("\n  ")}\n` +
  `Set KEYFRAME_LF_HANDOFF to the directory containing engine/ and pages/.`;

// ---- the canonical spine ------------------------------------------------------
// WHICH RENDERER RUNS AT WHICH INDEX IS TEMPLATE DATA, NOT PER-FILM DATA.
//
// Measured over the 27 kit films: taking the element-wise mode at each of the 40 positions
// yields a spine that 5 films match exactly, 13 films differ from by ONE entry, 8 by two, and
// only Nine Lives by nine. 38 override entries in total, mean 1.41 per film. The alternative —
// 27 authored 40-name arrays — would be 1,080 lines of duplication expressing 38 lines of
// intent, and would make "the second beat is a variant slot" invisible.
//
// Position 2 is that variant slot: {Wilt 8, Blink 7, Rain 5, Wave 5, Problem 1, Breathe 1}.
// Position 36 is where the 41-scene films insert Patience.
const SPINE = [
  "Open", "Problem", "Wilt", "Note", "Tally", "Flap", "Creed", "Marker", "Counts", "Slice",
  "Kit", "BoxList", "Cards", "Peek", "Rewrite", "Objections", "Steps", "Weeks", "Quote", "Rows",
  "Habit", "Grid", "LongShadow", "QA", "Ladder", "Receipt", "Seesaw", "Pile", "Curtain", "Metronome",
  "Stamps", "Ransom", "Accordion", "Gauge", "TearOff", "Bloom", "Offer", "Plans", "Recap", "Join",
];

// ---- extraction ---------------------------------------------------------------
// One vm context, every pack file run inside it, every LFKit.make(cfg) argument captured.
// The sandbox is deliberately tiny: no fs, no require, no timers, no Date. A cfg that needed
// any of them would throw here rather than at render time, which makes this extraction step
// its own determinism check.
function extractConfigs(engineDir) {
  const captured = [];
  const R = (type, props, ...children) => ({ __el: true, type, props: props || {}, children });
  const sandbox = {
    console, Math, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite, isNaN,
    React: { createElement: R, Fragment: "Fragment" }, window: {},
    document: { createElement: () => ({ getContext: () => null }) },
  };
  sandbox.window.React = sandbox.React;
  sandbox.LFKit = {
    rgba: (h, a) => `rgba(${h},${a})`,
    ease: new Proxy({}, { get: () => (t) => t }),
    lerp: (a, b, t) => a + (b - a) * t,
    clamp01: (x) => (x < 0 ? 0 : x > 1 ? 1 : x),
    make(cfg) { captured.push(cfg); return function Root() {}; },
  };
  sandbox.window.LFKit = sandbox.LFKit;
  vm.createContext(sandbox);
  const files = fs.readdirSync(engineDir).filter((x) => /^lf-pack-\d+\.js$/.test(x)).sort();
  for (const f of files) {
    const before = captured.length;
    vm.runInContext(fs.readFileSync(path.join(engineDir, f), "utf8"), sandbox, { filename: f, timeout: 20000 });
    for (let i = before; i < captured.length; i++) captured[i].__pack = f;
  }
  return captured;
}

// ---- the authored decks -------------------------------------------------------
// pages/<Name>.dc.html carries `window.OM_SCENES = '<json>'`. We need two things from it: the
// slug table, and each film's scene-name order (to derive its spine overrides). The JSON sits
// inside a SINGLE-QUOTED JS string, which is why the handoff README warns that a straight
// apostrophe breaks the film — we match to the closing `';</script>` rather than the first quote.
function loadDecks(pagesDir) {
  const decks = new Map();
  for (const f of fs.readdirSync(pagesDir).filter((x) => x.endsWith(".dc.html")).sort()) {
    const src = fs.readFileSync(path.join(pagesDir, f), "utf8");
    const m = src.match(/window\.OM_SCENES\s*=\s*'([\s\S]*?)';\s*<\/script>/);
    if (!m) continue;
    let scenes = null;
    try { scenes = JSON.parse(m[1]); } catch { continue; }
    if (!Array.isArray(scenes)) continue;
    const title = f.replace(/\.dc\.html$/, "");
    // Which cfg mounts this page — the x-import tells us, and it is the only reliable link
    // between a page and its identity (the brand string is a display name, not a key).
    const g = src.match(/component-from-global-scope="([A-Za-z0-9_]+)"/);
    decks.set(title, {
      title, slug: slugify(title), global: g ? g[1] : null,
      names: scenes.map((s) => s.name),
      durs: scenes.map((s) => Number(s.dur) || 0),
      scenes,
    });
  }
  return decks;
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// A cfg reaches its deck by the page's own x-import global, then by brand, then by the
// normalised slug — three passes because `HiveMind` must find "Hive Mind" and `KnifeBoard`
// must find "Knife and Board".
function deckFor(cfg, decks) {
  for (const d of decks.values()) if (d.global && d.global === cfg.global) return d;
  for (const d of decks.values()) if (norm(d.title) === norm(cfg.brand)) return d;
  for (const d of decks.values()) {
    const n = norm(cfg.global);
    if (norm(d.title) === n || norm(d.title.replace(/\band\b/g, "")) === n) return d;
  }
  return null;
}

// ---- spine overrides ----------------------------------------------------------
// A film is the SPINE plus a short edit list. Two edit kinds, in the order they must be
// applied: ["insert", index, name] splices a renderer in (the 41-scene films all insert
// Patience at 36), and [index, name] substitutes one. Derived, never authored — if the
// handoff changes a deck, re-running this generator moves the override with it.
function spineOverridesFor(names) {
  const ov = [];
  let work = names;
  if (names.length !== SPINE.length) {
    // Find the single splice that best explains the extra entry.
    let best = null;
    for (let k = 0; k < names.length; k++) {
      const trial = names.slice(0, k).concat(names.slice(k + 1));
      if (trial.length !== SPINE.length) continue;
      const diff = trial.reduce((a, n, i) => a + (n !== SPINE[i] ? 1 : 0), 0);
      if (!best || diff < best.diff) best = { k, diff, trial, ins: names[k] };
    }
    if (!best) return null; // length differs by more than one — the caller reports it
    ov.push(["insert", best.k, best.ins]);
    work = best.trial;
  }
  work.forEach((n, i) => { if (n !== SPINE[i]) ov.push([i, n]); });
  return ov;
}

// Replay an override list onto the spine — used by --check to prove the derivation round-trips.
function applySpine(overrides) {
  const subs = overrides.filter((o) => o[0] !== "insert");
  const out = SPINE.slice();
  for (const [i, name] of subs) out[i] = name;
  for (const o of overrides.filter((x) => x[0] === "insert")) out.splice(o[1], 0, o[2]);
  return out;
}

// ---- helpers ------------------------------------------------------------------
// '"Baloo 2", Georgia, serif' -> { family: "Baloo 2", fallback: "Georgia, serif" }
function parseStack(stack) {
  const s = String(stack || "");
  const m = /^\s*"([^"]+)"\s*(?:,\s*(.+))?$/.exec(s) || /^\s*'([^']+)'\s*(?:,\s*(.+))?$/.exec(s);
  if (m) return { family: m[1], fallback: (m[2] || "sans-serif").trim() };
  const parts = s.split(",");
  return {
    family: parts[0].replace(/["']/g, "").trim() || "system-ui",
    fallback: (parts.slice(1).join(",") || "sans-serif").trim(),
  };
}

// The average glyph advance, read from the repo's MEASURED per-character tables rather than a
// hand-kept constant table. gen-film-skins.js carries a 90-entry literal `EM` map because it
// predates fonts/font_metrics.js; every family the long-form drop uses is already measured
// there (verified: 51/51 hasMetrics), so there is no reason to re-guess.
let METRICS = null;
function emFor(family) {
  if (!METRICS) { try { METRICS = require("../src/fonts/font_metrics").METRICS; } catch { METRICS = {}; } }
  const m = METRICS[family];
  return m && typeof m.avg === "number" ? Number(m.avg.toFixed(4)) : 0.58;
}

// ---- derive -------------------------------------------------------------------
// THE SIX ROLES ARE FIXED. Every one of the 30 palettes returns exactly
// {paper, ink, accent, accent2, sageT, terraT} — so unlike FilmKit there is nothing to infer:
// no frequency scan over a look table, no luminance sort to guess which stop is ink. The roles
// ARE the contract, and the two accents are the two the tweak panel exposes, which is precisely
// the pair a brand should be allowed to take over.
const ROLES = ["paper", "ink", "accent", "accent2", "sageT", "terraT"];

function deriveSkin(cfg, deck) {
  const palette = cfg.palette({});
  const missing = ROLES.filter((r) => !(r in palette));
  const FH = parseStack(cfg.FH), FB = parseStack(cfg.FB);

  return {
    id: deck.slug,
    label: cfg.brand,
    global: cfg.global,
    pack: cfg.__pack,
    missingRoles: missing,

    display: FH.family, displayFallback: FH.fallback,
    body: FB.family, bodyFallback: FB.fallback,
    em: emFor(FH.family), bodyEm: emFor(FB.family),

    // The two roles a brand may take over, at their authored luminance. The other four
    // (paper/ink/sageT/terraT) are the film's ground system and rotate onto the brand hue.
    accents: ["accent", "accent2"],
    accentOpts: cfg.accentOpts || [],
    accent2Opts: cfg.accent2Opts || [],
    groundKey: "paper", inkKey: "ink", paperKey: "paper",
    desk: cfg.desk,

    // Camera pack. `camStride` is FilmKit's `camMul` renamed; the selection rule is identical
    // (CAMS[(i * stride + off) % len]), which is why the 9-token vocabulary carries over whole.
    cams: cfg.cams || [],
    camStride: cfg.camStride || 3,
    camOff: cfg.camOff || 1,
    ambient: cfg.ambient || 1.5,

    // The garnish voice — corner tag, italic footnote, vertical side label. Authored editorial
    // copy, rotated by scene index (TAGS[i%n], FOOTS[i%n], SIDES[(i>>1)%n]). Template-owned by
    // the governing law, which is a product decision flagged in the Phase 0 report, not a
    // technical one: they are carried across verbatim here so the decision stays reversible.
    tags: cfg.tags || [],
    foots: cfg.foots || [],
    sides: cfg.sides || [],

    spineOverrides: spineOverridesFor(deck.names),
    sceneCount: deck.names.length,
    durationSec: Number(deck.durs.reduce((a, b) => a + b, 0).toFixed(2)),
  };
}

// ---- emit ---------------------------------------------------------------------
function skinFile(cfg, s) {
  const worldSrc = cfg.World.toString();
  const paletteSrc = cfg.palette.toString();
  const ovs = s.spineOverrides || [];
  const resolved = applySpine(ovs);
  return `// ${String(s.label).toUpperCase()} — skin for the shared long-form stage (services/lf_stage.js).
//
// GENERATED by scripts/gen-lf-skins.js from the handoff source
// (templete-design/longform-handoff/engine/${s.pack}, template "${s.global}").
// Edit the handoff source and re-run the generator rather than editing this file.
//
// Display ${s.display} / body ${s.body}. Camera set ${JSON.stringify(s.cams)} at stride ${s.camStride}/${s.camOff}.
// ${s.sceneCount} scenes, ${s.durationSec}s, ${ovs.length === 0 ? "the canonical spine unmodified" : `${ovs.length} spine override${ovs.length === 1 ? "" : "s"}`}.
//
// palette and World below are the AUTHORED functions, emitted verbatim. The World is
// re-evaluated per seek against an SVG-DOM shim whose entire surface is {R, rgba} plus the
// utils object — verified by evaluating all 30 authored Worlds against exactly that sandbox —
// so the backdrop is not a reinterpretation of the original, it IS the original.

const stage = require("../lf_stage");

const SKIN = {
  id: ${JSON.stringify(s.id)},
  label: ${JSON.stringify(s.label)},

  // ---- type ----
  display: ${JSON.stringify(s.display)}, displayFallback: ${JSON.stringify(s.displayFallback)},
  body: ${JSON.stringify(s.body)}, bodyFallback: ${JSON.stringify(s.bodyFallback)},
  em: ${s.em}, bodyEm: ${s.bodyEm},

  // ---- palette ----
  // The authored function, called with {} for the design's own defaults. It returns the same
  // six roles on every one of the 27 films, so the stage can rely on them by name: paper and
  // ink are the type system, sageT and terraT are the alternating tinted grounds, and
  // accent/accent2 are the two a brand may take over at their authored luminance.
  palette: ${paletteSrc},
  accents: ${JSON.stringify(s.accents)},
  accentOpts: ${JSON.stringify(s.accentOpts)},
  accent2Opts: ${JSON.stringify(s.accent2Opts)},
  groundKey: ${JSON.stringify(s.groundKey)}, inkKey: ${JSON.stringify(s.inkKey)}, paperKey: ${JSON.stringify(s.paperKey)},
  desk: ${JSON.stringify(s.desk)},

  // ---- camera + motion ----
  cams: ${JSON.stringify(s.cams)},
  camStride: ${s.camStride}, camOff: ${s.camOff},
  ambient: ${s.ambient},

  // ---- the garnish voice ----
  // Rotated by scene index so no two consecutive frames read the same. Authored copy.
  tags: ${JSON.stringify(s.tags)},
  foots: ${JSON.stringify(s.foots)},
  sides: ${JSON.stringify(s.sides)},

  // ---- the spine ----
  // Which renderer runs at which index. The stage owns the canonical 40-name order; this is
  // only what THIS film does differently. ["insert", i, name] splices, [i, name] substitutes.
  // Resolves to: ${resolved.length} scenes.
  spineOverrides: ${JSON.stringify(ovs)},

  strings: {
    brandName: ${JSON.stringify(s.label)},
  },

  // ---- the world ----
  // The authored animated backdrop, verbatim. Pure in (theme, t, utils) — no Math.random, no
  // Date, no accumulated state anywhere in the six pack files — which is what lets it be
  // re-evaluated deterministically on every seek, forwards or backwards.
  World: ${worldSrc},
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
`;
}

// ---- main ---------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const only = argv.filter((a) => !a.startsWith("--"));

  // NO VACUOUS SKIP. See the header: the FilmKit generator's polite stand-down is exactly how
  // its guard came to verify nothing for the life of 97 packs. Both modes fail here.
  if (!HANDOFF) {
    console.error(`[lf-skins] ${MISSING_MSG}`);
    console.error(`[lf-skins] this source is expected to be committed — an absent drop is a real failure, not a reason to pass.`);
    process.exit(1);
  }

  const engineDir = path.join(HANDOFF, "engine");
  const pagesDir = path.join(HANDOFF, "pages");
  const decks = loadDecks(pagesDir);
  const configs = extractConfigs(engineDir);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let written = 0, skipped = 0, drift = 0;
  const manifest = [];
  const orphans = [];
  const problems = [];

  for (const cfg of configs) {
    const deck = deckFor(cfg, decks);
    if (!deck) { orphans.push(cfg.global); continue; }
    if (only.length && !only.includes(deck.slug)) { skipped++; continue; }

    const s = deriveSkin(cfg, deck);
    if (s.missingRoles.length) problems.push(`${deck.slug}: palette is missing ${s.missingRoles.join(", ")}`);
    if (!s.spineOverrides) { problems.push(`${deck.slug}: ${s.sceneCount} scenes cannot be expressed as one splice off the ${SPINE.length}-name spine`); continue; }
    // The derivation must round-trip, or an override list is a lie about the film.
    const rt = applySpine(s.spineOverrides);
    if (rt.join("|") !== deck.names.join("|")) { problems.push(`${deck.slug}: spine overrides do not replay to the authored deck`); continue; }

    const file = path.join(OUT_DIR, `${deck.slug.replace(/-/g, "_")}.js`);
    const body = skinFile(cfg, s);
    manifest.push({
      slug: deck.slug, module: path.basename(file), label: s.label, global: s.global, pack: s.pack,
      display: s.display, body: s.body, cams: s.cams, camStride: s.camStride, camOff: s.camOff,
      ambient: s.ambient, sceneCount: s.sceneCount, durationSec: s.durationSec,
      spineOverrides: s.spineOverrides,
    });

    if (check) {
      const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (cur !== body) { console.error(`DRIFT ${deck.slug}`); drift++; }
      continue;
    }
    fs.writeFileSync(file, body, "utf8");
    written++;
  }

  // Decks with no cfg are the bespoke films; cfgs with no deck are authored identities nobody
  // wrote a film for. BOTH are reported every run rather than silently dropped — an orphan that
  // stops being reported is an orphan that stops being noticed.
  const packedSlugs = new Set(manifest.map((m) => m.slug));
  const deckless = [...decks.values()].filter((d) => !packedSlugs.has(d.slug) && !(only.length && !only.includes(d.slug)));

  const manifestPath = path.join(OUT_DIR, "_manifest.json");
  const manifestBody = JSON.stringify(manifest, null, 2);

  if (check) {
    if (!only.length) {
      const cur = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
      if (cur !== manifestBody) { console.error(`DRIFT _manifest.json`); drift++; }
    }
    for (const p of problems) console.error(`PROBLEM ${p}`);
    console.log(`[lf-skins] ${manifest.length} skin(s) checked · ${orphans.length} cfg orphan(s): ${orphans.join(", ") || "none"} · ${deckless.length} deck(s) with no cfg: ${deckless.map((d) => d.slug).join(", ") || "none"}`);
    if (drift || problems.length) { console.error(`${drift} skin(s) drifted, ${problems.length} problem(s)`); process.exit(1); }
    console.log(`[lf-skins] all skins match the handoff source`);
    process.exit(0);
  }

  fs.writeFileSync(manifestPath, manifestBody, "utf8");
  for (const p of problems) console.error(`PROBLEM ${p}`);
  console.log(`[lf-skins] wrote ${written} skin(s) -> ${path.relative(ROOT, OUT_DIR)}${skipped ? ` (${skipped} skipped)` : ""}`);
  console.log(`[lf-skins] cfg orphans (no page, not packed): ${orphans.join(", ") || "none"}`);
  console.log(`[lf-skins] decks with no cfg (bespoke, out of scope): ${deckless.map((d) => d.slug).join(", ") || "none"}`);
  if (problems.length) process.exit(1);
}

main();
