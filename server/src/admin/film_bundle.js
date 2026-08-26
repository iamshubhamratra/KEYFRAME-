// FILM -> BUNDLE. Turns a hand-written (or model-written) film source into a
// self-contained HTML template the existing omelette pipeline can render.
//
// WHY THIS IS POSSIBLE AT ALL. The 142 shipped bundles are artifacts of an
// external "__bundler" tool: 1.2 MB of gzipped resource blobs keyed by UUID, with
// the film source not present as text anywhere. Reproducing that encoding would
// be reverse-engineering. It turns out not to be necessary — omelette_adapter
// only ever does three things to a bundle:
//   1. reads the `__bundler/template` block to learn the authored scene types,
//   2. TEXT-REWRITES `window.OM_SCENES = '…'` inside it with the film's real copy,
//   3. MERGES the job's brand and URL into `window.OM_TWEAKS`, also inside it.
// None of them touches the blobs. So any self-contained page that carries those
// declarations renders through the whole existing pipeline unchanged — but all
// THREE have to be in the block, and the film has to read them back from the
// block, because that is the only copy the adapter ever writes to.
//
// Two escaping traps, both found by writing one and watching it fail:
//   * OM_SCENES is raw JSON inside a SINGLE-quoted JS string. Escape ONLY "\" and
//     "'". JSON.stringify-ing twice leaves \" , which the adapter's unescape does
//     not undo, and the template then reports as "exposes no OM_SCENES" — a
//     message that blames the template rather than the escaping.
//   * The `__bundler/template` JSON must have every "/" escaped as "\/". The
//     adapter extracts it with a NON-GREEDY ([\s\S]*?)<\/script>, so the page's
//     own "</script>" would otherwise cut the JSON in half.
//
// JSX is compiled HERE, at build time, not in the browser: shipping
// @babel/standalone into every bundle would add ~3 MB per template and put a
// compiler in the render path for no benefit.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

const TPL_DIR = path.join(config.paths.root, "public", "omelette-templates");
const FILM_DIR = path.join(config.paths.root, "generated-films");

// React 18 UMD + GSAP — inlined so a bundle is offline and CSP-safe.
//
// GSAP IS NOT OPTIONAL. hyperframes captures by seeking, and it discovers the
// composition by patching gsap.timeline() into window.__timelines — that timeline
// is BOTH its duration source and its seek handle. A film clocked by
// requestAnimationFrame fails with "Composition has zero duration … GSAP
// timeline: false", and a static data-duration clip does not rescue it (measured
// three times). So a generated film owns one paused GSAP timeline of the film's
// length and renders from its playhead; React draws, GSAP keeps the time.
const VENDOR = [
  path.join(config.paths.root, "node_modules/react/umd/react.production.min.js"),
  path.join(config.paths.root, "node_modules/react-dom/umd/react-dom.production.min.js"),
  path.join(config.paths.root, "node_modules/gsap/dist/gsap.min.js"),
];

const FONT_LINK = (fams) => {
  const q = (fams || []).filter(Boolean).map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700;800;900`).join("&");
  return q ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">` : "";
};

// Shipped as SOURCE (String(fn)) rather than hand-escaped inside a string
// literal: the patterns below already carry two levels of backslash, and a third
// for the enclosing quotes is how a working regex silently becomes one that
// matches nothing.
const HYDRATE_FROM_BLOCK = function () {
  // The block is the ONLY declaration of these globals in the bundle, and it
  // serves both readings: untouched it holds the film's own demo copy (so the
  // raw template still renders for its poster and hover preview), and after the
  // adapter has rewritten it, the studio's copy and brand.
  var block = document.querySelector('script[type="__bundler/template"]');
  var page = null;
  try { page = JSON.parse(block.textContent); } catch (e) { /* film falls back to its own defaults */ }
  // Decode a JS string literal out of the page. At build time it is
  // SINGLE-quoted with only "\" and "'" escaped (omScenesLiteral, matching the
  // adapter's own reader); after the adapter rewrites it, it is a DOUBLE-quoted
  // JSON string. Escape-aware, because a "';" inside the film's copy would
  // otherwise end the match early and hand the film a fragment of its scenes.
  function lit(re) {
    if (!page) return null;
    var m = re.exec(page);
    if (!m) return null;
    var v = m[1];
    if (v.charAt(0) === '"') { try { return JSON.parse(v); } catch (e) { return null; } }
    return v.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }
  var scenes = lit(/window\.OM_SCENES\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/);
  if (scenes) window.OM_SCENES = scenes;
  var playback = lit(/window\.OM_PLAYBACK\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/);
  if (playback) window.OM_PLAYBACK = playback;
  // OM_TWEAKS reaches the film as an OBJECT. It ships in the EDITMODE object
  // form, but the adapter's other branch rewrites it as a quoted JSON string —
  // accept either, and hand the film the parsed object both ways.
  var tweaks = lit(/window\.OM_TWEAKS\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/);
  if (tweaks === null && page) {
    var em = /window\.OM_TWEAKS\s*=\s*\/\*EDITMODE-BEGIN\*\/([\s\S]*?)\/\*EDITMODE-END\*\//.exec(page);
    if (em) tweaks = em[1];
  }
  if (tweaks) { try { window.OM_TWEAKS = JSON.parse(tweaks); } catch (e) { /* film falls back to its own defaults */ } }
};

const OWNER_META = "keyframe-generated-film";

/** Owner id as it is stamped and compared: a pack slug, reduced to safe chars. */
function ownerIdFor(owner, templateId) {
  const s = String(owner || templateId || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || String(templateId || "");
}

/** The stamped owner of an existing bundle, or null if it carries no stamp. */
function ownerOf(file) {
  let head = "";
  let fd = null;
  try {
    // HEAD ONLY. A shipped bundle is ~1.2 MB of gzipped blobs and there are 142
    // of them; reading one whole file to check one meta tag is a cost this pays
    // on every single generation.
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(2048);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    head = buf.slice(0, n).toString("utf8");
  } catch { return null; }
  finally { if (fd !== null) { try { fs.closeSync(fd); } catch { /* already gone */ } } }
  const m = new RegExp(`<meta name="${OWNER_META}" content="([^"]*)">`).exec(head);
  return m ? m[1] : null;
}

// The thrown errors carry this code so callers can tell "the model wrote a bad
// film, try again" from "this name is taken, trying again cannot help" — a
// re-author costs a full frontier-model generation and would collide identically.
const ETPLCOLLISION = "ETPLCOLLISION";
const collision = (msg) => Object.assign(new Error(msg), { code: ETPLCOLLISION });

// DO NOT SILENTLY REPLACE A TEMPLATE THIS PACK DOES NOT OWN.
//
// buildBundle writes `<templateId>.html` into the SAME directory as the 142
// hand-built bundles, and templateId is derived from a pack slug — so the two
// namespaces collide by construction. It cost a shipped template already:
// authoring a film for "ember-roast" produced EmberRoast.html and overwrote the
// 1.2 MB EmberRoast bundle that 15 authored beats of coffee-roastery film lived
// in. There was no error and no warning; the only copy left was in git, and the
// pack went on pointing at a completely different film.
//
// Regenerating a pack's OWN film is the normal loop (author -> preview -> QA ->
// author again), so that stays free. Everything else refuses.
// Returns true when the write would REPLACE this pack's own existing film, so
// the caller can say so — checkBundleTarget uses the same rules without writing
// anything, and must not announce a replacement that is not happening.
function assertMayWrite(file, templateId, ownerId) {
  if (!fs.existsSync(file)) return false;
  const owner = ownerOf(file);
  if (owner === null) {
    throw collision(
      `refusing to overwrite ${templateId}.html — it is a hand-built bundle, not a generated film. `
      + "Pick a slug whose PascalCase form is not already a template "
      + `(the existing file is ${TPL_DIR}${path.sep}${templateId}.html).`,
    );
  }
  if (owner !== ownerId) {
    throw collision(
      `refusing to overwrite ${templateId}.html — it was generated for "${owner}", not "${ownerId}". `
      + "Two packs whose slugs share a PascalCase form cannot both own this template; rename one.",
    );
  }
  return true;
}

/**
 * Would buildBundle be allowed to write this template? Throws the same
 * ETPLCOLLISION error it would throw at the end.
 *
 * Exists so the name can be checked BEFORE the film is generated: the collision
 * is a property of the slug, and finding it after the model has written a whole
 * film means paying for the film and throwing it away.
 */
function checkBundleTarget({ templateId, owner } = {}) {
  const id = String(templateId || "");
  if (!id) return;
  assertMayWrite(path.join(TPL_DIR, `${id}.html`), id, ownerIdFor(owner, id));
}

/** PascalCase template id from a pack slug: "ember-roast" -> "EmberRoast". */
function templateIdFor(slug) {
  return String(slug || "").split(/[^a-z0-9]+/i).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
}

/** OM_SCENES payload: raw JSON, escaped for a single-quoted JS string. */
function omScenesLiteral(scenes) {
  return JSON.stringify(scenes).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function compileFilm(source) {
  // Required lazily so a box without the devDependency still boots the server.
  const babel = require("@babel/standalone");
  const out = babel.transform(source, {
    presets: [["react", { runtime: "classic" }]],
    filename: "film.jsx",
    compact: false,
  });
  if (!out || !out.code) throw new Error("babel produced no output for the film source");
  return out.code;
}

/**
 * Assemble a bundle.
 * @param {object} o
 * @param {string} o.templateId   PascalCase id; the file becomes <id>.html
 * @param {string} o.filmSource   JSX source (compiled here)
 * @param {Array}  o.scenes       authored OM_SCENES (scene types + demo copy)
 * @param {object} o.tweaks       OM_TWEAKS object (brand, accents, motion)
 * @param {Array}  o.fonts        Google font families to link
 * @param {string} [o.owner]      pack slug this film belongs to; stamped into the
 *                                bundle and checked before any overwrite (see
 *                                assertMayWrite). Defaults to the templateId.
 * @returns {{ file:string, bytes:number, templateId:string, owner:string }}
 */
function buildBundle({ templateId, filmSource, scenes, tweaks, fonts, width, height, owner } = {}) {
  // Portrait-native by default: these films are authored against 1080x1920 in
  // absolute px, so the canvas is declared, never inferred.
  const W = Number(width) || 1080;
  const H = Number(height) || 1920;
  if (!/^[A-Z][A-Za-z0-9]{2,40}$/.test(String(templateId || ""))) {
    throw new Error(`bad templateId ${JSON.stringify(templateId)} — must be PascalCase, 3-41 chars`);
  }
  const ownerId = ownerIdFor(owner, templateId);
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("buildBundle needs a non-empty scenes array");
  const code = compileFilm(String(filmSource || ""));
  const om = omScenesLiteral(scenes);
  const totalDur = scenes.reduce((a, s) => a + (Number(s.dur) || 3), 0) || 1;
  const reactSrc = VENDOR.map((p) => {
    if (!fs.existsSync(p)) throw new Error(`vendor file missing: ${p} — run: npm i react@18 react-dom@18 gsap@3.12.5`);
    return fs.readFileSync(p, "utf8");
  }).join("\n");

  // The wrapper page the adapter introspects. It is never EXECUTED as a page —
  // only read — so it stays tiny; but it is where the film's globals live, and
  // the bundle hydrates them straight back out of it at load.
  //
  // IT MUST DECLARE ALL THREE. The adapter rewrites the film's content ONLY
  // inside this block — OM_SCENES with the studio's copy, and OM_TWEAKS merged
  // with the real brand and URL. A global the page does not declare is a global
  // the adapter's replace finds nothing to match, so it is silently left alone:
  // omitting OM_TWEAKS here meant every generated film printed the DEMO brand in
  // the corner of every frame no matter whose film it was. OM_TWEAKS is written
  // in the EDITMODE object form, which is the branch of the adapter's two-form
  // merge that keeps the template's own knobs (accent, motion, …) intact.
  const page = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + `<script>window.OM_SCENES = '${om}';</script>`
    + `<script>window.OM_PLAYBACK = '{"mode":"loop"}';</script>`
    + `<script>window.OM_TWEAKS = /*EDITMODE-BEGIN*/${JSON.stringify(tweaks || {})}/*EDITMODE-END*/;</script>`
    + '</head><body><div id="root"></div></body></html>';

  const html = [
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">",
    // PROVENANCE, AND IT IS A SAFETY DEVICE, NOT A LABEL. This is what the
    // collision guard below reads to tell "a film I generated for this pack"
    // from "a hand-built bundle somebody shipped". It has to stay in the first
    // few hundred bytes: the guard reads only the head of the existing file,
    // because the shipped bundles are 1.2 MB each.
    `<meta name="${OWNER_META}" content="${ownerId}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    FONT_LINK(fonts),
    "<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}"
    + `#root{position:relative;width:${W}px;height:${H}px;transform-origin:top left}</style>`,
    "</head><body>",
    // THE TEMPLATE BLOCK LIVES IN <body>, NOT IN <head>, AND THAT IS LOAD-BEARING.
    //
    // The adapter stamps its parse-time dimension contract with
    //   html.replace(/<body([^>]*)>/i, …)
    // — the FIRST <body> in the file. All 142 shipped bundles put this block
    // inside the body, so that first match is the document's real one. With the
    // block in <head>, the first <body> in the file is the one inside this
    // block's JSON STRING, and the contract div was spliced in there instead,
    // raw unescaped quotes and all. The JSON then died at the injected
    // `<div class="composition"` and the film never mounted: a black video, with
    // lint, contrast, identity and the render all still passing.
    `<script type="__bundler/template">${JSON.stringify(page).replace(/\//g, "\\/")}</script>`,
    // THE COMPOSITION IS #root ITSELF, AND IT DECLARES ITS OWN LENGTH.
    //
    // This is the contract scene_kit uses and every one of the 203 rendering packs
    // satisfies: the root carries `data-composition-id="vid"` — matching the
    // `__timelines["vid"]` key — plus data-start/width/height/duration. A separate
    // hidden `.clip[data-duration]` div does NOT count; the capture kept reporting
    // "data-duration: not set" while one sat in the body. The attributes are
    // written at build time and corrected from OM_SCENES at load, because the
    // adapter rewrites the scene list per film.
    `<div id="root" data-composition-id="vid" data-start="0" data-width="${W}" data-height="${H}" data-duration="${totalDur}"></div>`,
    `<script>${reactSrc}</script>`,
    // HYDRATE THE GLOBALS OUT OF THE TEMPLATE BLOCK — it is the only copy the
    // adapter rewrites, so it is the only copy that carries the studio's film.
    //
    // These globals used to be declared a SECOND time as ordinary top-level
    // <script> tags, and those were what the film actually executed. The adapter
    // never touches them, so a generated film rendered the model's own demo copy
    // and demo brand for every job — a defect with no error and no missing frame,
    // just the wrong words. One source of truth instead: read the block. It runs
    // before the film script, so the film sees the finished globals.
    `<script>(${HYDRATE_FROM_BLOCK})();</script>`,
    // THE MASTER TIMELINE, CREATED SYNCHRONOUSLY AND REGISTERED BY HAND.
    //
    // hyperframes reports "No GSAP timeline registered (window.__timelines is
    // empty)" — it populates that array by patching gsap.timeline(), so a timeline
    // built later (inside a React effect, after paint) is never seen. Building it
    // here, in a plain script straight after gsap loads and before the film runs,
    // and PUSHING it onto window.__timelines ourselves, satisfies the probe
    // whichever way round the patching happens. The film then attaches its
    // onUpdate to this timeline rather than making its own.
    "<script>(function(){var s=[];try{s=JSON.parse(window.OM_SCENES)}catch(e){}"
      + `var d=s.reduce(function(a,x){return a+(Number(x.dur)||3)},0)||${totalDur};`
      + "window.__filmDuration=d;"
      + "var el=document.getElementById('root');if(el)el.setAttribute('data-duration',d);"
      + "var tl=window.gsap.timeline({paused:true});"
      + "tl.to({_:0},{_:1,duration:d,ease:'none'},0);"
      + "window.__filmTimeline=tl;"
      // __timelines is an OBJECT KEYED BY NAME, not an array — scene_kit registers
      // `window.__timelines["vid"] = tl`. Pushing to it as an array produces a
      // value with no enumerable string keys, which the probe reads as empty; that
      // is exactly what "window.__timelines is empty" was reporting while a
      // perfectly good timeline sat at index 0.
      + "window.__timelines=window.__timelines||{};"
      + "window.__timelines['vid']=tl;"
      + "})();</script>",
    `<script>${code}</script>`,
    "</body></html>",
  ].join("\n");

  fs.mkdirSync(TPL_DIR, { recursive: true });
  const file = path.join(TPL_DIR, `${templateId}.html`);
  if (assertMayWrite(file, templateId, ownerId)) {
    console.log(`[film_bundle] replacing ${templateId}.html — regenerating "${ownerId}"'s own film`);
  }
  fs.writeFileSync(file, html, "utf8");
  return { file, bytes: html.length, templateId, owner: ownerId };
}

module.exports = {
  buildBundle, checkBundleTarget, templateIdFor, omScenesLiteral, compileFilm,
  HYDRATE_FROM_BLOCK, ownerOf, ETPLCOLLISION, TPL_DIR, FILM_DIR,
};
