#!/usr/bin/env node
// GEN-FILM-SKINS — regenerate the 70 FilmKit pack skins from the handoff source.
//
// The handoff (templete-design/keyframe-handoff/source) ships 70 templates as
// `FilmKit.make(cfg)` calls against one shared engine. A cfg is STRUCTURED DATA — palette,
// per-beat look, camera set, entrance presets, interaction variants — plus three pure
// functions (palette, icon, World). So a skin is not hand-authored: it is derived, and this
// script is the derivation. Re-run it whenever the handoff source changes.
//
//   node scripts/gen-film-skins.js            # write every skin
//   node scripts/gen-film-skins.js --check    # verify on-disk skins match the source
//   node scripts/gen-film-skins.js ember-roast [more...]   # a subset
//
// The three functions are emitted VERBATIM (Function.prototype.toString), which is what
// makes the port exact rather than an interpretation — see the header of film_stage.js.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "..", "src", "services", "film_skins");

// THE SOURCE THIS DERIVES FROM IS NOT IN THE REPO.
//
// `keyframe-handoff/` is an authoring drop — it has never been tracked, and the sibling
// library beside it has already moved once (templete-design/ -> old-templete/, see the same
// note in shot-reference.js). A single hardcoded join therefore did two harmful things: it
// crashed with a raw ENOENT stack out of a top-level readdirSync at REQUIRE time, before
// main() could say what was missing, and it made `npm test` permanently red on every machine
// that is not the original author's — a red chain nobody can green is a chain people stop
// reading. Resolve against candidates, env override first, and return null rather than throw
// so the caller decides what an absent source means for the mode it is running in.
const HANDOFF_CANDIDATES = [
  process.env.KEYFRAME_FILM_HANDOFF || "",
  path.join(ROOT, "old-templete", "keyframe-handoff"),
  path.join(ROOT, "old-template", "keyframe-handoff"),
  path.join(ROOT, "templete-design", "keyframe-handoff"),
].filter(Boolean);

// BOTH HALVES OR NEITHER. The drop is two directories and this script needs them both:
// `source/` supplies the pack configs, and `standalone/` supplies the slug vocabulary that
// loadSlugs() reads to name every derived skin. Probing for `source/` alone accepted a
// half-present drop and then died in loadSlugs() with a raw ENOENT out of node:fs — which is
// exactly the crash the comment above says this resolver exists to prevent, just moved one
// directory along. It is not a hypothetical split either: `standalone/` is the bundle's BUILD
// and is gitignored (see .gitignore), so a checkout that restores the tracked `source/` has
// precisely this shape. Requiring both puts an incomplete drop back on main()'s legible
// skip/hard-error path, where the mode gets to decide what absent means.
function resolveHandoff() {
  for (const dir of HANDOFF_CANDIDATES) {
    try {
      if (fs.statSync(path.join(dir, "source")).isDirectory()
        && fs.statSync(path.join(dir, "standalone")).isDirectory()) return dir;
    } catch { /* next candidate */ }
  }
  return null;
}
const HANDOFF = resolveHandoff();
const SRC = HANDOFF ? path.join(HANDOFF, "source") : null;
const MISSING_MSG =
  `no FilmKit handoff source found. Looked in:\n  ${HANDOFF_CANDIDATES.join("\n  ")}\n` +
  `Set KEYFRAME_FILM_HANDOFF to a directory containing BOTH source/{mega,world}-pack-N.js and standalone/*.html.`;

// ---- extraction ---------------------------------------------------------------
function extractConfigs() {
  const captured = [];
  const R = (type, props, ...children) => ({ __el: true, type, props: props || {}, children });
  const sandbox = {
    console, Math, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite, isNaN,
    React: { createElement: R, Fragment: "Fragment" }, window: {},
  };
  sandbox.window.React = sandbox.React;
  sandbox.FilmKit = {
    rgba: (h, a) => `rgba(${h},${a})`,
    PRESETS: new Proxy({}, { get: () => () => ({}) }),
    make(cfg) { captured.push(cfg); return function Root() {}; },
  };
  sandbox.window.FilmKit = sandbox.FilmKit;
  vm.createContext(sandbox);
  for (const f of fs.readdirSync(SRC).filter((x) => /^(mega|world)-pack-\d+\.js$/.test(x)).sort()) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), sandbox, { filename: f, timeout: 20000 });
  }
  return captured;
}

// ---- slugs --------------------------------------------------------------------
// Lazy, not top-level: a missing handoff must reach main()'s legible report rather than
// aborting the require with a stack trace that names only node:fs.
let SLUGS = [];
function loadSlugs() {
  SLUGS = fs.readdirSync(path.join(HANDOFF, "standalone"))
    .filter((f) => f.endsWith(".html") && f !== "index.html").map((f) => f.replace(/\.html$/, ""));
}
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
function slugFor(cfg) {
  for (const c of [cfg.global, cfg.brand]) {
    const n = norm(c);
    const hit = SLUGS.find((s) => norm(s) === n);
    if (hit) return hit;
  }
  for (const c of [cfg.global, cfg.brand]) {
    const n = norm(c);
    const hit = SLUGS.find((s) => norm(s.replace(/-and-/g, "")) === n || norm(s).replace(/and/g, "") === n);
    if (hit) return hit;
  }
  return null;
}

// ---- colour helpers (build-time only) -----------------------------------------
const hexToRgb = (h) => {
  h = String(h || "#000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const relLum = (h) => {
  const [r, g, b] = hexToRgb(h).map((v) => v / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// ---- the display-face advance table -------------------------------------------
// Average glyph advance in em, per display family. This drives the headline fitter: the
// wrap target is column / (size x em) and the final size is column / widest-line-advance.
// A condensed face like Anton fits nearly twice the characters of Archivo Black at the same
// point size, and one shared constant would either clip the first or leave the second timid.
const EM = {
  // condensed / narrow
  "Anton": 0.44, "Bebas Neue": 0.42, "Oswald": 0.48, "Barlow Condensed": 0.44,
  "Big Shoulders Display": 0.40, "Fjalla One": 0.50, "Staatliches": 0.46, "Saira": 0.52,
  // heavy / wide
  "Archivo Black": 0.84, "Alfa Slab One": 0.76, "Titan One": 0.70, "Bungee": 0.80,
  "Passion One": 0.52, "Lilita One": 0.58, "Shrikhand": 0.68, "Bevan": 0.70,
  "Monoton": 0.78, "Audiowide": 0.72, "Michroma": 0.86, "Krona One": 0.74,
  "Russo One": 0.62, "Righteous": 0.58, "Chonburi": 0.62, "Bangers": 0.48,
  "Boogaloo": 0.50, "Grandstander": 0.62, "Paytone One": 0.60, "Grenze Gotisch": 0.46,
  "Press Start 2P": 1.00, "Silkscreen": 0.72, "VT323": 0.50, "Unbounded": 0.66,
  // serif display
  "Playfair Display": 0.52, "DM Serif Display": 0.54, "Abril Fatface": 0.58,
  "Libre Bodoni": 0.54, "Yeseva One": 0.56, "Gloock": 0.54, "Prata": 0.56,
  "Cormorant Garamond": 0.44, "EB Garamond": 0.46, "Marcellus": 0.50, "Italiana": 0.42,
  "Cinzel": 0.58, "Gilda Display": 0.48, "Castoro": 0.50, "Young Serif": 0.56,
  "Zilla Slab": 0.52, "Bree Serif": 0.54, "Vollkorn": 0.52, "Merriweather": 0.56,
  "Spectral": 0.50, "Bitter": 0.54, "Gelasio": 0.50,
  // geometric / grotesque display
  "Syne": 0.58, "Sora": 0.58, "Outfit": 0.56, "Jost": 0.52, "Poppins": 0.58,
  "Manrope": 0.56, "Lexend": 0.56, "Urbanist": 0.52, "Epilogue": 0.54, "Onest": 0.54,
  "Familjen Grotesk": 0.54, "Schibsted Grotesk": 0.54, "Instrument Sans": 0.54,
  "Geologica": 0.56, "Chakra Petch": 0.52, "Exo 2": 0.52, "Orbitron": 0.66,
  "Kanit": 0.52, "Prompt": 0.52, "Comfortaa": 0.60, "Quicksand": 0.56, "Fredoka": 0.58,
  "Baloo 2": 0.56, "Varela Round": 0.56, "Nunito": 0.54, "Rubik": 0.55, "Sen": 0.54,
  "Gochi Hand": 0.46, "Neucha": 0.46, "Lobster Two": 0.48, "Chewy": 0.58,
  "Atkinson Hyperlegible": 0.55, "Commissioner": 0.54, "Livvic": 0.52,
};
const emFor = (family) => EM[family] || 0.58;

// ---- helpers ------------------------------------------------------------------
// '"Alfa Slab One", serif' -> { family: "Alfa Slab One", fallback: "serif" }
function parseStack(stack) {
  const s = String(stack || "");
  const m = /^\s*"([^"]+)"\s*(?:,\s*(.+))?$/.exec(s) || /^\s*'([^']+)'\s*(?:,\s*(.+))?$/.exec(s);
  if (m) return { family: m[1], fallback: (m[2] || "sans-serif").trim() };
  const parts = s.split(",");
  return { family: parts[0].replace(/["']/g, "").trim() || "system-ui", fallback: (parts.slice(1).join(",") || "sans-serif").trim() };
}
const BEATS = ["hook", "statement", "feature", "montage", "stats", "cta"];
function freqOrder(vals) {
  const f = new Map();
  for (const v of vals) if (v) f.set(v, (f.get(v) || 0) + 1);
  return [...f.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}
const isKey = (palette, v) => typeof v === "string" && v[0] !== "#" && Object.prototype.hasOwnProperty.call(palette, v);

function deriveSkin(cfg, slug) {
  const palette = cfg.palette({});
  const keys = Object.keys(palette);
  const look = cfg.look || {};
  const FH = parseStack(cfg.FH), FB = parseStack(cfg.FB);

  // ACCENTS — the colour the design puts its emphasis in, which is what a brand should take
  // over. Read from every beat's `hi` slot, ordered by how often the design uses it. Tweakable
  // keys are a weaker signal (they include the GROUND on most packs), so they only top it up.
  const hiKeys = freqOrder([...BEATS.map((b) => look[b] && look[b].hi), look.app && look.app.hi].filter((v) => isKey(palette, v)));
  const tweakKeys = (cfg.tweaks || []).map((t) => t.k).filter((k) => keys.includes(k));
  const accents = [...new Set([...hiKeys, ...tweakKeys])].slice(0, 3);

  // GROUND — the field the film mostly sits on.
  const bgKeys = freqOrder(BEATS.map((b) => look[b] && look[b].bg).filter((v) => isKey(palette, v)));
  const groundKey = bgKeys[0] || keys[0];

  // INK / PAPER — the darkest and lightest stops. Every "does this text read here" decision
  // in the engine bisects between these two, which is what replaces the source's hardcoded
  // light/dark assumptions and keeps it correct for any brand hue.
  const byLum = [...keys].sort((a, b) => relLum(palette[a]) - relLum(palette[b]));
  const inkKey = byLum[0], paperKey = byLum[byLum.length - 1];
  const dark = relLum(palette[groundKey]) < 0.4;

  return {
    id: slug,
    label: cfg.brand,
    display: FH.family, displayFallback: FH.fallback,
    body: FB.family, bodyFallback: FB.fallback,
    mono: cfg.codeFont ? parseStack(cfg.codeFont).family : null,
    em: emFor(FH.family),
    titleLine: cfg.titleLine || 1.04,
    titleSpace: cfg.titleSpace || "0",
    titlePreset: cfg.titlePreset || "rise",
    itemPreset: cfg.itemPreset || "pop",
    accents, groundKey, inkKey, paperKey, dark,
    cams: cfg.cams, camMul: cfg.camMul || 5, camOff: cfg.camOff || 1,
    mag: cfg.mag || null,
    variants: cfg.variants || {},
    badge: cfg.badge || "circle",
    ambient: cfg.ambient || 1.7,
    media: cfg.media,
    energy: 1,
    palette, look,
  };
}

// ---- emit ---------------------------------------------------------------------
const J = (v) => JSON.stringify(v, null, 2).split("\n").map((l, i) => (i ? "  " + l : l)).join("\n");

function skinFile(cfg, slug, s) {
  const worldSrc = cfg.World ? cfg.World.toString() : null;
  const iconSrc = cfg.icon ? cfg.icon.toString() : null;
  const groundSrc = cfg.groundCss ? cfg.groundCss.toString() : null;
  const paletteSrc = cfg.palette.toString();
  const mechs = Object.keys(s.variants);
  return `// ${s.label.toUpperCase()} — skin for the shared FilmKit stage (services/film_stage.js).
//
// GENERATED by scripts/gen-film-skins.js from the handoff source
// (templete-design/keyframe-handoff/source/${cfg.__pack}, template "${cfg.global}").
// Edit the handoff source and re-run the generator rather than editing this file.
//
// Display ${s.display} / body ${s.body}. Camera set ${JSON.stringify(s.cams)}.
// Entrances: title "${s.titlePreset}", items "${s.itemPreset}".
// Owns the ${mechs.length ? mechs.map((m) => `${m}:${s.variants[m]}`).join(", ") : "core"} mechanic${mechs.length === 1 ? "" : "s"}.
//
// palette / icon / World below are the AUTHORED functions, emitted verbatim — the world in
// particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not a
// reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: ${JSON.stringify(s.id)},
  label: ${JSON.stringify(s.label)},

  // ---- type ----
  display: ${JSON.stringify(s.display)}, displayFallback: ${JSON.stringify(s.displayFallback)},
  body: ${JSON.stringify(s.body)}, bodyFallback: ${JSON.stringify(s.bodyFallback)},
  ${s.mono ? `mono: ${JSON.stringify(s.mono)},` : "mono: null,"}
  em: ${s.em},
  titleLine: ${s.titleLine}, titleSpace: ${JSON.stringify(s.titleSpace)},
  titlePreset: ${JSON.stringify(s.titlePreset)}, itemPreset: ${JSON.stringify(s.itemPreset)},

  // ---- palette ----
  // The authored function. Called with {} to get the design's own defaults; the brand's
  // accents are then hue-mapped onto \`accents\` slot by slot at their authored luminance,
  // and every other stop rotates onto the brand's lead hue — so a brand recolours the whole
  // world, not just the headline.
  palette: ${paletteSrc},
  accents: ${JSON.stringify(s.accents)},
  groundKey: ${JSON.stringify(s.groundKey)}, inkKey: ${JSON.stringify(s.inkKey)}, paperKey: ${JSON.stringify(s.paperKey)},
  dark: ${s.dark},

  // ---- per-beat look (verbatim) ----
  look: ${J(s.look)},

  // ---- camera + motion ----
  cams: ${JSON.stringify(s.cams)}, camMul: ${s.camMul}, camOff: ${s.camOff},
  mag: ${s.mag ? JSON.stringify(s.mag) : "null"},
  ambient: ${s.ambient},
  energy: ${s.energy},
  badge: ${JSON.stringify(s.badge)},
  ${s.media === false ? "media: false," : ""}

  // ---- the mechanics this pack owns ----
  // The handoff's promise is that no two templates share a mechanism. A pack that does not
  // declare a mechanic here never renders it.
  variants: ${JSON.stringify(s.variants)},

  strings: {
    brandName: ${JSON.stringify(s.label)},
  },
${iconSrc ? `
  // The chrome mark, rendered once at build time.
  icon: ${iconSrc},
` : ""}${groundSrc ? `
  groundCss: ${groundSrc},
` : ""}
  // ---- the world ----
  // The authored animated backdrop, verbatim. Pure in (theme, t, progress, utils); no
  // Math.random and no Date, which is what lets it be re-evaluated deterministically on
  // every seek.
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

  // AN ABSENT SOURCE MEANS DIFFERENT THINGS IN THE TWO MODES, and conflating them is how a
  // generator silently produces nothing. `--check` verifies a DERIVATION: with no source to
  // derive from there is nothing to compare, so it reports that plainly and stands down —
  // skipping loudly, never claiming the skins were checked. Write mode has no such out: being
  // asked to regenerate from a source that is not there is a hard error.
  if (!HANDOFF) {
    if (check) {
      console.log(`[film-skins] SKIPPED — ${MISSING_MSG.split("\n")[0]}`);
      console.log(`[film-skins] the handoff drop is an authoring input and is not tracked in this repo; on-disk skins were NOT verified.`);
      process.exit(0);
    }
    console.error(MISSING_MSG);
    process.exit(1);
  }
  loadSlugs();

  const configs = extractConfigs();
  // Re-run the pack files one at a time so each cfg knows which file it came from.
  const packOf = new Map();
  {
    let i = 0;
    for (const f of fs.readdirSync(SRC).filter((x) => /^(mega|world)-pack-\d+\.js$/.test(x)).sort()) {
      const n = (fs.readFileSync(path.join(SRC, f), "utf8").match(/FilmKit\.make\(/g) || []).length;
      for (let k = 0; k < n; k++) packOf.set(i++, f);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let written = 0, skipped = 0, drift = 0;
  const manifest = [];
  configs.forEach((cfg, i) => {
    const slug = slugFor(cfg);
    if (!slug) { console.error(`!! no slug for ${cfg.global}`); return; }
    if (only.length && !only.includes(slug)) { skipped++; return; }
    cfg.__pack = packOf.get(i) || "?";
    const s = deriveSkin(cfg, slug);
    const file = path.join(OUT_DIR, `${slug.replace(/-/g, "_")}.js`);
    const body = skinFile(cfg, slug, s);
    manifest.push({ slug, module: path.basename(file), label: s.label, display: s.display, body: s.body, accents: s.accents, groundKey: s.groundKey, dark: s.dark, variants: s.variants });
    if (check) {
      const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (cur !== body) { console.error(`DRIFT ${slug}`); drift++; }
      return;
    }
    fs.writeFileSync(file, body, "utf8");
    written++;
  });
  // A CHECK THAT WRITES IS NOT A CHECK. `--check` used to fall through to this line and
  // rewrite _manifest.json on every run — so the verifier `npm test` invokes could modify
  // tracked source, and a drifted manifest silently repaired itself instead of being reported.
  // (Same defect family as apply-media-profiles.js's write-by-default.) Compare it instead;
  // a filtered subset can't speak for the whole file, so it only compares on a full run.
  const manifestPath = path.join(OUT_DIR, "_manifest.json");
  const manifestBody = JSON.stringify(manifest, null, 2);
  if (check) {
    if (!only.length) {
      const cur = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
      if (cur !== manifestBody) { console.error(`DRIFT _manifest.json`); drift++; }
    }
    console.log(drift ? `${drift} skin(s) drifted from the handoff source` : `all skins match the handoff source`);
    process.exit(drift ? 1 : 0);
  }
  fs.writeFileSync(manifestPath, manifestBody, "utf8");
  console.log(`wrote ${written} skin(s) -> ${path.relative(ROOT, OUT_DIR)}${skipped ? ` (${skipped} skipped)` : ""}`);
}

main();
