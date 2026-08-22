// LONG-FORM FILM TEMPLATES — the config surface for the ten 16:9 five-minute films that live,
// unmodified, in <root>/longform_templates.
//
// WHAT THIS FILE IS FOR. The films are reference implementations: they render pixel-identical to
// how they render standing alone, and nothing in this repo may restyle, refactor or "improve"
// them. They take their input from exactly four window globals (OM_SCENES, OM_PLAYBACK,
// OM_TWEAKS, OM_CONTENT) which the shipped `.dc.html` sets inline before the film loads. This
// module is the ONLY place our side writes those globals, and it writes them by substituting the
// values into a served copy of the page — the files on disk are never touched.
//
// WHY SUBSTITUTION AND NOT AN APPENDED OVERRIDE SCRIPT. Three of the four globals are read at
// different moments (see the contract note below), and `pet-story-film.jsx:32` reads OM_TWEAKS at
// MODULE-EVALUATION time — the instant the film's <script> body runs. Anything appended after the
// page's own assignments races that evaluation. Substituting at the authored assignment site is
// the only override that is ordering-proof, and the pages carry the marker comments
// (/*EDITMODE-BEGIN*/, /*CONTENT-BEGIN*/) precisely so an authoring host can do it.
//
// WHEN EACH GLOBAL IS READ — the fact a caller has to know:
//   OM_TWEAKS    at module evaluation of <name>-film.jsx (top-level `const` in every film).
//                Writing it after the film script has run does nothing at all.
//   OM_SCENES    at render, passed to <CompositionStage scenes={...}>.
//   OM_PLAYBACK  at render, same.
//   OM_CONTENT   at render, through kit/content.js's `const src = () => window.OM_CONTENT || {}`,
//                so a late write needs a repaint to show up.
//
// The registry is derived from the shipped pages rather than hardcoded here. A hand-kept table of
// scene counts and global names is a table that drifts the first time a film is retimed; reading
// the `.dc.html` means the registry cannot disagree with what the browser actually loads.

const fs = require("node:fs");
const path = require("node:path");

const config = require("../config");

/** Absolute path to the collection root — the folder that holds animations-v3.jsx, kit/, _ds/ and templates/. */
const COLLECTION_DIR = path.join(config.paths.root, "longform_templates");

/** The URL prefix the collection is mounted at. Kept here so the route and the registry agree. */
const MOUNT = "/longform";

// ─────────────────────────────────────────────────── the third-party runtime, served locally ──
//
// ROUTE A FETCHES ITS RUNTIME FROM unpkg.com. support.js pulls React 18.3.1 UMD (twice) and
// @babel/standalone 7.29.0 over the public internet on every single page load, because it
// transpiles the JSX in the browser. Nothing in the collection's docs says so. In this product that
// is a production defect rather than a preference: renders run inside server/Dockerfile's container
// against a headless Chromium, and a blocked egress rule, a proxy, or an unpkg outage turns every
// film into a blank 1920x1080 rectangle with no error anyone would attribute to a CDN.
//
// support.js:1149 provides the escape hatch itself:
//
//     function cdnScriptFor(url, sri) {
//       const res = window.__resources;
//       const v = res ? res[url] : void 0;
//       return typeof v === "string" && v ? { src: v } : { src: url, integrity: sri };
//     }
//
// So a `window.__resources` map from CDN url to local url, set before support.js runs, redirects
// all three without touching a single shipped file. The bytes in longform_vendor/ were verified
// against the SRI digests support.js:1144-1148 publishes for exactly these URLs.
//
// FAIL-SAFE IN BOTH DIRECTIONS. The map is only injected when all three files are actually present
// on disk. A checkout without them serves the pages exactly as delivered and reaches unpkg, which
// is the old behaviour rather than a broken one.
const VENDOR_DIR = path.join(config.paths.root, "longform_vendor");
const VENDOR_MOUNT = `${MOUNT}/_vendor`;
const CDN_LOCAL = {
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js": "react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": "react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js": "babel.min.js",
};

/** True when every vendored runtime file is on disk, so the redirect can be complete or not at all. */
function vendorReady() {
  try { return Object.values(CDN_LOCAL).every((f) => fs.existsSync(path.join(VENDOR_DIR, f))); }
  catch { return false; }
}

/** True when the self-hosted Caprasimo/Figtree faces are on disk. Same all-or-nothing rule. */
function fontsReady() {
  try {
    const dir = path.join(VENDOR_DIR, "fonts");
    return fs.existsSync(path.join(dir, "fonts.css"))
      && fs.readdirSync(dir).some((f) => f.endsWith(".woff2"));
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────── types ──
//
// This repo is JavaScript, not TypeScript, so "typed" here means JSDoc typedefs that editors and
// `tsc --checkJs` both honour, plus a real runtime validator (`normalizeConfig`) — a type that is
// only a comment stops a typo in an editor and lets it through at runtime, which is the half that
// matters when the writer is a generator rather than a person.

/**
 * One entry of the film's timeline.
 *
 * `name` is a LOOKUP KEY inside the film, not a label — the film finds its choreography by this
 * string. Renaming one silently drops that scene's animation; the engine shows a badge in the
 * authoring host but the exported video just holds still. Retime by changing `dur`; cut a scene by
 * dropping the whole entry.
 *
 * @typedef {Object} LongformScene
 * @property {string} name    the film's scene key — never renamed
 * @property {number} dur     seconds this scene occupies
 * @property {string} [desc]  human label, shown in the authoring host's timeline
 * @property {number} [nat]   natural-duration hint in seconds
 */

/**
 * @typedef {Object} LongformPlayback
 * @property {"loop"|"times"} mode
 * @property {number} [count]  required when mode === "times"; how many times to play through
 */

/**
 * Brand adaptation. `brand` and `brand2` replace the two accents; `palette()` in kit/film-kit.js
 * derives the light / mid / deep / glow / veil steps from them, so one injected colour flows
 * through fills, gradients, borders, shapes, glows and type accents while each template keeps its
 * own grounds and geometry.
 *
 * @typedef {Object} LongformTweaks
 * @property {string} [brand]   #rrggbb
 * @property {string} [brand2]  #rrggbb
 * @property {"Calm"|"Lively"|"Bouncy"} [energy]  ambient motion scale — see ENERGY_VALUES
 */

/**
 * Per-scene copy, keyed by the scene's `name`. Every field is optional and falls back PER FIELD
 * (not per scene) to the film's demo copy, so a partially-filled job renders demo text for the
 * rest rather than blank frames.
 *
 * @typedef {Object} LongformSceneContent
 * @property {string} [kicker]
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [label]
 * @property {string} [quote]
 * @property {string} [source]
 * @property {string|number} [stat]
 * @property {string} [unit]
 * @property {string[]} [items]
 * @property {Array<[string, string]>} [rows]
 */

/**
 * @typedef {Object.<string, LongformSceneContent>} LongformContent
 */

/**
 * The whole config surface. Everything is optional: an empty object renders the film exactly as it
 * renders standing alone.
 *
 * @typedef {Object} LongformConfig
 * @property {LongformScene[]} [scenes]     replaces OM_SCENES wholesale
 * @property {LongformPlayback} [playback]  replaces OM_PLAYBACK
 * @property {LongformTweaks} [tweaks]      merged over the page's shipped OM_TWEAKS
 * @property {LongformContent} [content]    replaces OM_CONTENT — template 01 only
 */

/**
 * @typedef {Object} LongformTemplate
 * @property {string} id            directory name, e.g. "01-pet-story"
 * @property {string} title         display name taken from the page filename, e.g. "Pet Story"
 * @property {string} global        the window global the film assigns, e.g. "PetStoryFilm"
 * @property {string} page          the page filename, e.g. "Pet Story.dc.html"
 * @property {string} url           the mounted URL of the page, ready to iframe
 * @property {string[]} kits        the scripts the page loads, in the order it loads them
 * @property {boolean} hasContent   whether this film is wired to OM_CONTENT
 * @property {LongformScene[]} scenes  the shipped timeline
 * @property {number} sceneCount
 * @property {number} durationSec   sum of `dur` across the shipped timeline
 * @property {LongformTweaks} tweaks   the shipped brand tokens
 */

/**
 * The energy values the FILMS actually accept.
 *
 * NOT the ones INTEGRATION.md documents. Every film carries the literal map
 * `{ Calm: 0.6, Lively: 1, Bouncy: 1.4 }` and falls back to 1 for anything else, so the documented
 * "Urgent" is accepted-and-ignored. Validating against the code rather than the prose means a
 * caller asking for "Urgent" gets an error naming the three real values instead of a film that
 * quietly runs at Lively. Reported to the collection's authors; not fixed here.
 */
const ENERGY_VALUES = ["Calm", "Lively", "Bouncy"];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ────────────────────────────────────────────────────────────────────── registry ──

/** @type {{mtime: number, list: LongformTemplate[]}|null} */
let cache = null;

function pageFilesIn(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".dc.html"));
}

/** Pull a single-quoted JS string literal out of `window.OM_X = '…';`. */
function readQuotedGlobal(html, name) {
  const m = html.match(new RegExp(`window\\.${name}\\s*=\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  return m ? m[1] : null;
}

/** Pull a marker-delimited object literal out of `window.OM_X = /*BEGIN* /{…}/*END* /;`. */
function readMarkedGlobal(html, name, marker) {
  const m = html.match(new RegExp(`window\\.${name}\\s*=\\s*/\\*${marker}-BEGIN\\*/([\\s\\S]*?)/\\*${marker}-END\\*/`));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/**
 * The keys a film's content contract actually accepts, read from its `const DEMO = {...}`.
 *
 * NOT the scene list. The contract is keyed by DEMO, which is also what `CT.audit()` walks, and the
 * two are deliberately not the same set: template 01's garnish is composition-level rather than a
 * scene, so its keys (GarnishTag/GarnishFoot/GarnishSide) are declared in DEMO and appear in no
 * timeline. Validating supplied content against scene names rejected exactly those keys.
 */
function contentKeysOf(dir, id) {
  try {
    const film = fs.readdirSync(dir).find((f) => f.endsWith("-film.jsx"));
    if (!film) return [];
    const src = fs.readFileSync(path.join(dir, film), "utf8");
    const m = src.match(/\nconst DEMO = \{\n([\s\S]*?)\n\};/);
    if (!m) return [];
    return [...m[1].matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*):/gm)].map((x) => x[1]);
  } catch { return []; }
}

/**
 * Read the collection off disk. Cached against the newest page mtime, so editing a `.dc.html`
 * during development is picked up without a restart and a hot path never re-reads ten files.
 *
 * @returns {LongformTemplate[]}
 */
function listTemplates() {
  const root = path.join(COLLECTION_DIR, "templates");
  if (!fs.existsSync(root)) return [];
  const dirs = fs.readdirSync(root).filter((d) => /^\d\d-/.test(d)).sort();

  let newest = 0;
  const pages = [];
  for (const id of dirs) {
    const dir = path.join(root, id);
    const [page] = pageFilesIn(dir);
    if (!page) continue;
    const file = path.join(dir, page);
    newest = Math.max(newest, fs.statSync(file).mtimeMs);
    pages.push({ id, page, file });
  }
  if (cache && cache.mtime === newest && cache.list.length === pages.length) return cache.list;

  const list = pages.map(({ id, page, file }) => {
    const dir = path.dirname(file);
    const html = fs.readFileSync(file, "utf8");
    const globalName = (html.match(/component-from-global-scope="([^"]+)"/) || [])[1] || "";
    const kits = ((html.match(/\bfrom="([^"]+)"/) || [])[1] || "").split(/\s+/).filter(Boolean);
    const raw = readQuotedGlobal(html, "OM_SCENES");
    /** @type {LongformScene[]} */
    let scenes = [];
    try { scenes = raw ? JSON.parse(raw) : []; } catch { scenes = []; }
    return {
      id,
      title: page.replace(/\.dc\.html$/, ""),
      global: globalName,
      page,
      url: `${MOUNT}/templates/${id}/${encodeURIComponent(page)}`,
      kits,
      hasContent: /window\.OM_CONTENT\s*=/.test(html),
      scenes,
      sceneCount: scenes.length,
      durationSec: scenes.reduce((a, s) => a + (Number(s.dur) || 0), 0),
      tweaks: readMarkedGlobal(html, "OM_TWEAKS", "EDITMODE") || {},
      contentKeys: contentKeysOf(dir, id),
    };
  });

  cache = { mtime: newest, list };
  return list;
}

/**
 * @param {string} id  directory name ("01-pet-story") or global ("PetStoryFilm"), case-insensitive
 * @returns {LongformTemplate|null}
 */
function getTemplate(id) {
  if (!id) return null;
  const key = String(id).toLowerCase();
  return listTemplates().find((t) => t.id.toLowerCase() === key || t.global.toLowerCase() === key) || null;
}

// ──────────────────────────────────────────────────────────────────── validation ──

class LongformConfigError extends Error {}

function fail(msg) { throw new LongformConfigError(msg); }

/**
 * Validate a host config against one template and fill in nothing it did not ask for. Returns a
 * config whose every present key is known-good, so `serializeGlobals` never has to guess.
 *
 * Rejects rather than ignores. A generator that mistypes a scene name, hands `content` to a film
 * with hardcoded copy, or asks for the documented-but-unimplemented "Urgent" energy would
 * otherwise get a film that renders — just not the one it asked for, which is the failure mode
 * that costs a whole 300-second render to notice.
 *
 * @param {string} id
 * @param {LongformConfig} [cfg]
 * @returns {LongformConfig}
 */
function normalizeConfig(id, cfg = {}) {
  const tpl = getTemplate(id);
  if (!tpl) fail(`unknown long-form template "${id}" (have: ${listTemplates().map((t) => t.id).join(", ")})`);
  if (cfg == null || typeof cfg !== "object" || Array.isArray(cfg)) fail("config must be an object");

  const unknown = Object.keys(cfg).filter((k) => !["scenes", "playback", "tweaks", "content"].includes(k));
  if (unknown.length) fail(`unknown config key(s): ${unknown.join(", ")}`);

  /** @type {LongformConfig} */
  const out = {};

  if (cfg.scenes !== undefined) {
    if (!Array.isArray(cfg.scenes) || !cfg.scenes.length) fail("scenes must be a non-empty array");
    // The film looks its choreography up by name, so a name it does not know is a scene that
    // occupies time and animates nothing. Check against the shipped list rather than trusting the
    // caller — cutting and retiming are supported, inventing is not.
    const known = new Set(tpl.scenes.map((s) => s.name));
    const seen = new Set();
    out.scenes = cfg.scenes.map((s, i) => {
      if (!s || typeof s.name !== "string" || !s.name) fail(`scenes[${i}].name must be a non-empty string`);
      if (!known.has(s.name)) fail(`scenes[${i}].name "${s.name}" is not a scene in ${tpl.id} — the film looks scenes up by name, so this one would animate nothing`);
      if (seen.has(s.name)) fail(`scenes[${i}].name "${s.name}" appears twice`);
      seen.add(s.name);
      const dur = Number(s.dur);
      if (!isFinite(dur) || dur <= 0) fail(`scenes[${i}].dur must be a positive number`);
      const e = { name: s.name, dur };
      if (s.desc !== undefined) e.desc = String(s.desc);
      if (s.nat !== undefined) e.nat = Number(s.nat);
      return e;
    });
  }

  if (cfg.playback !== undefined) {
    const p = cfg.playback;
    if (!p || typeof p !== "object") fail("playback must be an object");
    if (p.mode !== "loop" && p.mode !== "times") fail('playback.mode must be "loop" or "times"');
    out.playback = p.mode === "loop" ? { mode: "loop" } : { mode: "times", count: Math.max(1, Math.floor(Number(p.count) || 1)) };
  }

  if (cfg.tweaks !== undefined) {
    const t = cfg.tweaks;
    if (!t || typeof t !== "object") fail("tweaks must be an object");
    const bad = Object.keys(t).filter((k) => !["brand", "brand2", "energy"].includes(k));
    if (bad.length) fail(`unknown tweaks key(s): ${bad.join(", ")}`);
    for (const k of ["brand", "brand2"]) {
      if (t[k] !== undefined && !HEX_RE.test(String(t[k]))) fail(`tweaks.${k} must be a #rrggbb hex, got ${JSON.stringify(t[k])}`);
    }
    if (t.energy !== undefined && !ENERGY_VALUES.includes(t.energy)) {
      fail(`tweaks.energy must be one of ${ENERGY_VALUES.join(" | ")} — note INTEGRATION.md documents "Urgent", but no film maps it and it silently renders as Lively`);
    }
    // Merged over the page's own tokens, not replacing them: a caller that sets only `brand` keeps
    // the film's authored second accent instead of losing it to undefined.
    out.tweaks = { ...tpl.tweaks, ...t };
  }

  if (cfg.content !== undefined) {
    if (!tpl.hasContent) {
      fail(`${tpl.id} has hardcoded copy — it declares no OM_CONTENT, so supplying content would render nothing. Only ${listTemplates().filter((x) => x.hasContent).map((x) => x.id).join(", ")} is wired to the content contract`);
    }
    if (!cfg.content || typeof cfg.content !== "object" || Array.isArray(cfg.content)) fail("content must be an object keyed by scene name");
    // Validate against what the film DECLARES, not against its timeline — see contentKeysOf. Scene
    // names are unioned in so a film whose DEMO could not be parsed still gets a useful check.
    const known = new Set([...(tpl.contentKeys || []), ...tpl.scenes.map((s) => s.name)]);
    for (const k of Object.keys(cfg.content)) {
      // A key the film consumes nowhere is worse than a crash: the job looks filled and still
      // renders demo copy. CT.audit() only catches that after a full playthrough; catching the
      // unknown-key case here costs nothing.
      if (!known.has(k)) fail(`content key "${k}" is not declared by ${tpl.id} (it accepts: ${[...known].sort().join(", ")})`);
    }
    out.content = cfg.content;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────── serialisation ──

/**
 * Emit a JS source literal that is safe inside an inline <script>.
 *
 * `</script>` anywhere in the data would close the tag early and drop the rest of the page into the
 * document as text; escaping `<` as < is the standard fix and leaves the parsed value
 * identical. Scene descriptions are author-written prose and content is host-supplied, so both can
 * contain anything.
 */
function jsLiteral(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Turn a validated config into the exact source text each global is assigned.
 *
 * OM_SCENES and OM_PLAYBACK are STRINGS on the wire — the pages ship them single-quoted and the
 * engine parses them — so they are double-serialised on purpose: JSON to a string, then that
 * string to a JS string literal. Handing the engine a real array instead works today but is not
 * the documented contract.
 *
 * @param {string} id
 * @param {LongformConfig} cfg  already through normalizeConfig
 * @returns {{OM_SCENES?: string, OM_PLAYBACK?: string, OM_TWEAKS?: string, OM_CONTENT?: string}}
 */
function serializeGlobals(id, cfg) {
  const out = {};
  if (cfg.scenes) out.OM_SCENES = jsLiteral(JSON.stringify(cfg.scenes));
  if (cfg.playback) out.OM_PLAYBACK = jsLiteral(JSON.stringify(cfg.playback));
  if (cfg.tweaks) out.OM_TWEAKS = jsLiteral(cfg.tweaks);
  if (cfg.content) out.OM_CONTENT = jsLiteral(cfg.content);
  return out;
}

/**
 * Substitute the serialised globals into the page's own assignment sites.
 *
 * The marker comments are preserved so the result is still round-trippable by the authoring host
 * that put them there. A global the config does not set is left exactly as shipped — which is why
 * an empty config leaves all four assignments exactly as the file on disk has them. (The served
 * page is not byte-identical to the file overall — injectResources adds the local-runtime and
 * font tags after this runs — but nothing the film reads as configuration is altered.)
 *
 * @param {string} html  the page as shipped
 * @param {{OM_SCENES?: string, OM_PLAYBACK?: string, OM_TWEAKS?: string, OM_CONTENT?: string}} globals
 * @returns {string}
 */
function injectGlobals(html, globals) {
  // A SUBSTITUTION THAT DOES NOT FIRE MUST BE AN ERROR, NEVER A NO-OP. The failure it prevents is
  // the expensive one: the page still loads, the film still runs, and it runs on the SHIPPED demo
  // brand and demo timeline — five minutes of render that looks right and is not the job that was
  // asked for. So each replacement counts its own hits and anything but exactly one is fatal.
  const subs = [
    ["OM_SCENES", /(window\.OM_SCENES\s*=\s*)'(?:[^'\\]|\\.)*'/, (lhs, v) => lhs + v],
    ["OM_PLAYBACK", /(window\.OM_PLAYBACK\s*=\s*)'(?:[^'\\]|\\.)*'/, (lhs, v) => lhs + v],
    ["OM_TWEAKS", /(window\.OM_TWEAKS\s*=\s*)\/\*EDITMODE-BEGIN\*\/[\s\S]*?\/\*EDITMODE-END\*\//,
      (lhs, v) => `${lhs}/*EDITMODE-BEGIN*/${v}/*EDITMODE-END*/`],
    ["OM_CONTENT", /(window\.OM_CONTENT\s*=\s*)\/\*CONTENT-BEGIN\*\/[\s\S]*?\/\*CONTENT-END\*\//,
      (lhs, v) => `${lhs}/*CONTENT-BEGIN*/${v}/*CONTENT-END*/`],
  ];
  let out = html;
  for (const [name, re, build] of subs) {
    const value = globals[name];
    if (!value) continue;
    let hits = 0;
    out = out.replace(re, (_m, lhs) => { hits++; return build(lhs, value); });
    if (hits !== 1) {
      fail(`could not write ${name}: matched its assignment ${hits} time(s) in the page, expected exactly 1 — the page's OM_* assignment shape has changed and this config surface needs updating to match`);
    }
  }
  return out;
}

/**
 * Point support.js at the locally served runtime instead of unpkg.com.
 *
 * Inserted immediately before the page's own `<script src="./support.js">`, because support.js
 * reads `window.__resources` lazily inside cdnScriptFor() but the first read happens as soon as it
 * starts resolving the x-import list. Anything later races that.
 *
 * A no-op when the vendored files are absent, so this can never be the reason a page fails.
 *
 * @param {string} html
 * @returns {string}
 */
function injectResources(html) {
  const tags = [];

  if (vendorReady()) {
    const map = {};
    for (const [cdn, file] of Object.entries(CDN_LOCAL)) map[cdn] = `${VENDOR_MOUNT}/${file}`;
    tags.push(`<script>window.__resources=Object.assign(${jsLiteral(map)},window.__resources||{});</script>`);
  }

  // THE TWO TYPEFACES, ALSO FROM OUR OWN ORIGIN. styles.css:2 opens with
  // `@import url('https://fonts.googleapis.com/css2?family=Caprasimo…&family=Figtree…')`, so with no
  // egress the display face falls back to `serif` and the body to `system-ui` — the films still
  // render, they just render in the wrong typography, which is worse than failing loudly.
  //
  // This does NOT touch styles.css (forbidden) and does NOT override --font-heading/--font-body.
  // It only adds @font-face rules under the SAME family names the tokens already ask for, built
  // from the exact Google CSS the design system requests, so the faces resolve locally and the
  // tokens are untouched. INTEGRATION.md:262-266 names self-hosting as the supported remedy.
  if (fontsReady()) tags.push(`<link rel="stylesheet" href="${VENDOR_MOUNT}/fonts/fonts.css">`);

  if (!tags.length) return html;
  let hits = 0;
  const out = html.replace(/<script\s+src="\.\/support\.js"><\/script>/, (m) => { hits++; return tags.join("") + m; });
  // Silence here would mean shipping a page that still reaches unpkg while the logs say otherwise.
  if (hits !== 1) fail(`could not point the runtime at ${VENDOR_MOUNT}: matched the support.js tag ${hits} time(s), expected exactly 1`);
  return out;
}

/**
 * The whole path: id + host config -> the HTML to serve.
 *
 * @param {string} id
 * @param {LongformConfig} [cfg]
 * @returns {{html: string, template: LongformTemplate, config: LongformConfig}}
 */
function renderPage(id, cfg) {
  const tpl = getTemplate(id);
  if (!tpl) fail(`unknown long-form template "${id}"`);
  const clean = normalizeConfig(tpl.id, cfg);
  const file = path.join(COLLECTION_DIR, "templates", tpl.id, tpl.page);
  let html = injectGlobals(fs.readFileSync(file, "utf8"), serializeGlobals(tpl.id, clean));
  html = injectResources(html);
  return { html, template: tpl, config: clean, localRuntime: vendorReady() };
}

/**
 * Config carried on a URL, for the iframe embed in section 2 of INTEGRATION.md. base64url of the
 * JSON — the content object nests, so flat query params cannot express it.
 */
function encodeConfig(cfg) {
  return Buffer.from(JSON.stringify(cfg || {}), "utf8").toString("base64url");
}

function decodeConfig(s) {
  if (!s) return {};
  let json;
  try { json = Buffer.from(String(s), "base64url").toString("utf8"); } catch { fail("cfg is not valid base64url"); }
  try { return JSON.parse(json); } catch { fail("cfg does not decode to JSON"); }
}

module.exports = {
  COLLECTION_DIR,
  MOUNT,
  VENDOR_DIR,
  VENDOR_MOUNT,
  CDN_LOCAL,
  vendorReady,
  fontsReady,
  injectResources,
  ENERGY_VALUES,
  LongformConfigError,
  listTemplates,
  getTemplate,
  normalizeConfig,
  serializeGlobals,
  injectGlobals,
  renderPage,
  encodeConfig,
  decodeConfig,
};
