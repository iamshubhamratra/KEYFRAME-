// Iconify — 200k+ open-licensed SVG icons (Lucide, Tabler, Phosphor, Solar,
// Material Symbols…), KEYLESS. Used for vector/icon needs: clean, on-brand,
// deterministic line/solid art that stock "vector" photos never delivered. Icons
// are recolored to the pack accent via ?color= so they read on any ground.
//
// SVG-native: unlike stock providers this writes an .svg file directly and
// bypasses the ffprobe raster gate (an SVG has no video stream). The composer
// already places .svg assets — the curated library returns them too.

const fs = require("node:fs");
const path = require("node:path");
const { subjectQuery } = require("./query_terms");

const API = "https://api.iconify.design";

// Collection families biased per pack style (order = preference). Kept small and
// high-quality so a query resolves to a coherent icon set, not a random mix.
const STYLE_PREFIXES = {
  line:    "lucide,tabler,ph,mynaui",
  solid:   "material-symbols,mdi,ph,solar",
  duotone: "solar,ph",
  soft:    "solar,ph,iconoir",
};

async function apiJson(url, timeoutMs = 12_000) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "keyframe-studio/0.1 (asset fetcher)" },
  });
  if (!resp.ok) throw new Error(`iconify HTTP ${resp.status}`);
  return resp.json();
}

// Search icon names for a term. Returns ["prefix:name", ...].
async function searchIcons({ query, iconStyle, limit = 24 }) {
  const q = String(query || "").trim();
  if (!q) return [];
  const u = new URL(`${API}/search`);
  u.searchParams.set("query", q);
  u.searchParams.set("limit", String(limit));
  const prefixes = STYLE_PREFIXES[iconStyle];
  if (prefixes) u.searchParams.set("prefixes", prefixes);
  try {
    const data = await apiJson(u.toString());
    return Array.isArray(data.icons) ? data.icons : [];
  } catch (e) {
    console.warn(`[iconify] search failed for "${q}": ${e.message}`);
    return [];
  }
}

async function downloadSvg(iconId, color, outPath) {
  const [prefix, name] = String(iconId).split(":");
  if (!prefix || !name) return null;
  const u = new URL(`${API}/${prefix}/${name}.svg`);
  if (color) u.searchParams.set("color", color); // URL encodes '#'
  u.searchParams.set("width", "128");
  u.searchParams.set("height", "128");
  const resp = await fetch(u.toString(), { signal: AbortSignal.timeout(12_000) });
  if (!resp.ok) throw new Error(`iconify svg HTTP ${resp.status}`);
  const svg = await resp.text();
  if (!/<svg[\s>]/i.test(svg) || svg.length < 40) return null;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, "utf8");
  return outPath;
}

// Generic adjectives / fillers + camera-motion verbs that leak in from a scene's
// visualDirection ("camera pulls back", "messy collapses clean"). Searching these
// grabs the wrong icon — "clean X" → a hand-washing icon, "camera Y" → a camera —
// so they must never be the FIRST search term; a concrete noun wins.
const ICON_STOP = new Set([
  "the", "and", "for", "with", "your", "our", "its", "into", "onto", "from", "that", "this", "new", "all", "one", "two",
  "clean", "messy", "rapid", "quick", "fast", "slow", "smart", "easy", "simple", "best", "great", "good", "modern",
  "bold", "calm", "soft", "bright", "dark", "light", "big", "small", "huge", "tiny", "real", "live", "more", "less",
  "seamless", "effortless", "instant", "clear", "shareable", "messy",
  "zoom", "zooms", "zooming", "pan", "pans", "panning", "pull", "pulls", "push", "pushes", "reveal", "reveals",
  "revealing", "show", "shows", "showing", "slide", "slides", "fade", "fades", "drift", "drifts", "float", "floats",
  "spin", "spins", "collapse", "collapses", "collapsing", "turn", "turns", "lands", "settles",
  "instantly", "smoothly", "gently", "quickly", "across", "back", "then", "over", "around", "dizzying", "sweeping",
  "camera", "shot", "scene", "angle", "motion", "moving", "frame", "closeup", "wide",
]);

// Scene directions are phrases ("scalable growth", "clean browser frame zooms");
// reduce them to iconic terms so the search hits a REAL, on-topic icon. Concrete
// nouns first (skip the generic/verb stoplist), then a short whole phrase, then
// anything left — so an abstract camera direction never wins over the subject noun.
function iconQueryTerms(query) {
  const words = String(query || "").toLowerCase().match(/[a-z]{3,}/g) || [];
  const nouns = words.filter((w) => !ICON_STOP.has(w));
  const terms = [];
  for (const w of nouns) if (!terms.includes(w)) terms.push(w);           // concrete nouns lead
  if (words.length && words.length <= 3) {                                 // a short whole phrase can resolve ("bar chart")
    const phrase = words.join(" ");
    if (!terms.includes(phrase)) terms.push(phrase);
  }
  for (const w of words) if (!terms.includes(w)) terms.push(w);            // last resort: any word
  return terms.slice(0, 4);
}

// PICK THE ICON THE QUERY ASKED FOR, NOT A RANDOM ONE.
//
// This used to draw uniformly from the top 6 hits "for variety". An icon is
// frequently the ONLY graphic in its scene, so a bad draw is a whole beat that
// contradicts the narration — and Iconify's top 6 for a term routinely mixes
// sets and variants ("chart-bar", "chart-bar-horizontal-fill", "chart-pie",
// something unrelated that carries the term as an alias). Rank instead: how many
// of the query's words the icon NAME actually carries, then the plainest name.
//
// Zero overlap is NOT a rejection — Iconify matches aliases and categories too
// ("revenue" legitimately returns lucide:banknote), so a no-overlap icon can be
// the right one. It just sorts below anything that names the subject outright.
function rankIcons(icons, wanted) {
  const want = new Set(wanted);
  return icons
    .map((iconId, i) => {
      const name = String(iconId).split(":")[1] || "";
      const parts = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const hits = parts.filter((p) => want.has(p)).length;
      // Canonical names are short: "chart-bar" IS the bar chart, everything
      // longer is a variant of it. Break ties toward the plainer name, then
      // toward Iconify's own order.
      return { iconId, score: hits * 100 - parts.length * 2 - name.length * 0.1, i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.iconId);
}

// Fetch ONE icon SVG for a need. Returns { path, iconId } or null. `outputPath`
// is a raster path (.jpg) from the caller; we rewrite the extension to .svg.
async function fetchIcon({ query, color, iconStyle, outputPath }) {
  const svgPath = outputPath.replace(/\.[^.]+$/, "") + ".svg";
  // Strip camera/motion direction with the same cleaner the stock path uses
  // before the terms are derived; keep the raw query when nothing survives, since
  // an approximate icon still beats an empty slot.
  const cleaned = subjectQuery(query) || query;
  const wanted = String(cleaned).toLowerCase().match(/[a-z]{3,}/g) || [];
  for (const term of iconQueryTerms(cleaned)) {
    const icons = await searchIcons({ query: term, iconStyle });
    if (!icons.length) continue;
    // Try the best few in order — a download failure falls to the next-best icon
    // for the same term rather than abandoning the term entirely.
    for (const pick of rankIcons(icons, wanted.concat(term.split(/\s+/))).slice(0, 3)) {
      try {
        const p = await downloadSvg(pick, color, svgPath);
        if (p) return { path: p, iconId: pick };
      } catch (e) {
        console.warn(`[iconify] download failed for ${pick}: ${e.message}`);
      }
    }
  }
  return null;
}

// Fetch ONE BRAND MARK by its EXACT simple-icons slug. Returns { path, iconId }
// or null. Deliberately not routed through fetchIcon: that path exists to GUESS
// an icon for a phrase (search a term, rank the hits, take the best), and a guess
// is the one thing a brand mark must never be. Measured through searchIcons with
// the collection filter a solid-style pack uses, "edge" comes back
// arrow-or-edge / arrow-and-edge / razor-double-edge with mdi:microsoft-edge
// buried among them, and "chrome" comes back chrome-reader-mode — the beat that
// said "Edge" would draw an arrowhead. Here the slug is the whole request: the
// caller (services/brand_mentions.js) resolves it from a curated map or skips the
// mention entirely, and a 404 means "no mark", never "try something else".
//
// RECOLOURED TO THE PACK INK, not left to the brand's own colour, and that is a
// choice rather than an accident of plumbing. simple-icons ships single-colour
// silhouettes — the file for slack is one `<path fill="currentColor">`, so the
// brand's real multi-colour presentation is not on offer from this endpoint at
// all. Worse, `currentColor` in a file loaded through `<img src>` has no element
// to inherit from and resolves to BLACK, which is invisible on every dark pack.
// The shape is what identifies the brand; the ink is what makes it legible, so
// the mark takes the pack's accent exactly as every other Iconify vector does.
async function fetchBrandMark({ slug, color, outputPath }) {
  const s = String(slug || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(s)) return null;
  const svgPath = outputPath.replace(/\.[^.]+$/, "") + ".svg";
  try {
    const p = await downloadSvg(`simple-icons:${s}`, color, svgPath);
    return p ? { path: p, iconId: `simple-icons:${s}` } : null;
  } catch (e) {
    console.warn(`[iconify] brand mark "${s}" unavailable: ${e.message}`);
    return null;
  }
}

module.exports = { fetchIcon, searchIcons, fetchBrandMark };
