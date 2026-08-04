// COMPOSER KIT — the scaffolding every native composer needs and none of them should own.
//
// The 16 portrait composers grew independently from imported design bundles, so each ended
// up carrying its own byte-identical copy of the same primitives: HTML escaping, 2-dp
// rounding, hex→rgb, relative luminance, the GSAP CDN pin, the logo finder, the bullet
// extractor. 100+ redundant copies of ~10 symbols, every one of them a place a future fix
// has to be applied 16 times and will not be.
//
// WHAT LIVES HERE. Only primitives that are genuinely pack-independent. Three deliberate
// exclusions, because "the source text is identical" is NOT the same as "the behaviour is
// shared":
//
//   • pickNumber — SAME NAME, TWO INCOMPATIBLE CONTRACTS. om_stage and prisma_composer
//     return a parsed `{ pre, target, suf }` counter spec (or null); the other twelve return
//     a plain BOOLEAN "does this scene contain a digit". Both are correct for their callers.
//     Unifying them under one export would silently break one group, so each keeps its own
//     and this note exists so nobody "helpfully" merges them later.
//
//   • GRAIN_SVG / GRAIN_URI — the text is identical but the VALUE is not: the paper-textured
//     packs (editorial-motion, paper-craft) author `baseFrequency='0.85'` against everyone
//     else's `0.9`. That is art direction, not drift. Exposed as grainUri(baseFrequency) so
//     both survive exactly.
//
//   • headlineSize / fitCap / fitPlateW — identical bodies that close over PER-PACK layout
//     constants (SAFE_LINE_CQW, MEAN_ADVANCE_EM, the module's `_portrait` flag, frameHmul).
//     Hoisting them would need those threaded through every call site; the win is real but
//     it is a separate, larger refactor with real behavioural risk.
//
// Everything exported here is pure and side-effect free.

const { isLogo } = require("./asset_priority");

// The pinned GSAP build every composer loads. One place to bump.
const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";

// 2-dp rounding for emitted CSS numbers — keeps documents byte-stable across runs.
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// HTML-escape for any interpolated string. Every composer builds markup by concatenation,
// so this is the single defence against a headline containing a quote or angle bracket.
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// WCAG relative luminance — the basis of every contrast decision in the packs.
function relLum(hex) {
  const [rr, gg, bb] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function longestWord(s) {
  return (String(s || "").match(/\S+/g) || [""]).reduce((a, b) => (b.length > a.length ? b : a), "");
}

// A scene's on-screen list copy: the storyboard's own items when it has them, else the
// subtext split on sentence/bullet/em-dash boundaries.
function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (!list.length && scene.subtext) list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  return list.slice(0, n);
}

// The brand mark among the collected assets. Video files are excluded: a clip can be tagged
// logo-ish by the classifier but cannot be drawn into an <img> lockup.
function logoAssetOf(assets) {
  return (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;
}

// SEPARATION FROM A LIVE BACKDROP.
//
// These packs paint an animated <canvas> world — leaves, aurora ribbons, city lights, grain —
// between the ground and the copy, and every one of them grades its type against the FLAT
// ground colour. Nothing in that calculation can see the canvas painted in between, so a
// decoration in the pack's own palette can drift straight through a headline set in a
// neighbouring hue and the glyphs lose their edge. Confirmed on real renders: a lantern behind
// "Notion" (lantern-night, flagged by QA as a readability blocker) and a leaf sitting on the
// "A" of "Acme" (nature-flow).
//
// The composition cannot know where a decoration will be — the world is time-driven — so the
// type carries its own protection: a tight halo in the GROUND colour, which is by definition
// the value the scene was designed to read against. Invisible on a clean background; restores
// the edge wherever something passes behind. Offsets are in cqw so they hold at any output
// size, and it is static, so it costs nothing per frame.
function displayShadow(ground, alpha = 0.55) {
  const [r0, g0, b0] = hexToRgb(ground);
  const c = `rgba(${r0},${g0},${b0},${alpha})`;
  return `text-shadow:0 0.19cqw 0.93cqw ${c}, 0 0 0.37cqw ${c};`;
}

// The film-grain texture, as a self-contained data URI. `baseFrequency` is the pack's own
// grain character — see the note above on why this is a parameter and not a constant.
const grainSvg = (baseFrequency = 0.9) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/></svg>`;
const grainUri = (baseFrequency = 0.9) =>
  "data:image/svg+xml;base64," + Buffer.from(grainSvg(baseFrequency)).toString("base64");

// ---- the film's brand name ---------------------------------------------------------------
// SHARED, because it is the most visible text a pack prints. Any composer with a persistent
// running head or wordmark shows this on EVERY frame, so a bad answer is repeated the whole
// film — and two packs solving it separately drifted into two different bad answers.
//
// Three real failures shaped this, all from live jobs:
//   • A generated title is often a SENTENCE, not "Brand <sep> tagline". Slicing 24 characters
//     off it printed "BOARD DECKS IN AN" across nine frames.
//   • Recovering the brand from the first host-shaped token in the script picked up a
//     database reference and printed "DB".
//   • Allowing any 2-6 character TLD matched "report.json" and printed "REPORT".
const BRAND_DOMAIN_RE = /\b([a-z0-9][a-z0-9-]*\.(?:[a-z]{2,}))(?:\/\S*)?\b/i;
const BRAND_GENERIC = /^(www|app|get|try|the|api|cdn|mail|blog|docs|dev|db|test|localhost|example)$/i;
const BRAND_NOT_TLD = /^(json|js|jsx|ts|tsx|css|scss|html|htm|png|jpg|jpeg|gif|svg|webp|mp4|mov|md|txt|xml|yml|yaml|sql|csv|tsv|pdf|zip|tar|gz|sh|py|rb|go|rs|java|php|env|log|lock|toml|ini|conf)$/i;

function domainIn(s) {
  const m = String(s || "").match(BRAND_DOMAIN_RE);
  return m ? m[1] : "";
}
// The head of a conventional "Brand <sep> tagline" page title.
function titleHead(title) {
  const s = String(title || "").trim();
  if (!s) return "";
  const head = s.split(/\s+[–—|·]\s+|\s+-\s+|:\s+/)[0].trim() || s;
  const pick = head.length >= 2 ? head : s;
  if (pick.length <= 24) return pick;
  return pick.slice(0, 24).replace(/\s+\S*$/, "").trim() || pick.slice(0, 24);
}
// Returns "" when nothing trustworthy is available — a caller should print a neutral mark
// rather than a fragment of prose repeated on every frame.
function resolveBrandName(title, scenes) {
  const t = String(title || "").trim();
  // A separator means the writer named the brand; that beats any inference.
  if (/\s+[–—|·]\s+|\s+-\s+|:\s+/.test(t)) { const b = titleHead(t); if (b) return b; }
  // Scan from the CTA BACKWARDS — the film's real address lives in its closing beat.
  const list = Array.isArray(scenes) ? scenes : [];
  const pool = [];
  for (let i = list.length - 1; i >= 0; i--) pool.push(list[i] && list[i].subtext, list[i] && list[i].emphasis, list[i] && list[i].headline);
  pool.push(t);
  for (const x of pool) {
    const d = domainIn(x);
    if (!d) continue;
    const parts = d.split(".");
    const label = parts[0], tld = parts[parts.length - 1];
    if (label && label.length >= 3 && !BRAND_GENERIC.test(label) && !/^\d/.test(label)
        && tld.length >= 2 && tld.length <= 6 && !BRAND_NOT_TLD.test(tld)) return label;
  }
  const b = titleHead(t);
  // One or two words read as a name; a clause does not.
  return String(b).trim().split(/\s+/).filter(Boolean).length <= 2 ? b : "";
}

module.exports = {
  GSAP_CDN, r, clamp, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, displayShadow,
  grainSvg, grainUri, resolveBrandName, domainIn, titleHead,
};
