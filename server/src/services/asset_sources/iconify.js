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

// Scene directions are phrases ("scalable growth"); reduce to iconic terms so the
// search hits real icons — the whole (short) phrase first, then salient words.
function iconQueryTerms(query) {
  const words = String(query || "").toLowerCase().match(/[a-z]{3,}/g) || [];
  const terms = [];
  if (words.length && words.length <= 3) terms.push(words.join(" "));
  for (const w of words) if (!terms.includes(w)) terms.push(w);
  return terms.slice(0, 4);
}

// Fetch ONE icon SVG for a need. Returns { path, iconId } or null. `outputPath`
// is a raster path (.jpg) from the caller; we rewrite the extension to .svg.
async function fetchIcon({ query, color, iconStyle, outputPath }) {
  const svgPath = outputPath.replace(/\.[^.]+$/, "") + ".svg";
  for (const term of iconQueryTerms(query)) {
    const icons = await searchIcons({ query: term, iconStyle });
    if (!icons.length) continue;
    // Sample among the top few for variety (the curated library does the same).
    const pool = icons.slice(0, Math.min(icons.length, 6));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    try {
      const p = await downloadSvg(pick, color, svgPath);
      if (p) return { path: p, iconId: pick };
    } catch (e) {
      console.warn(`[iconify] download failed for ${pick}: ${e.message}`);
    }
  }
  return null;
}

module.exports = { fetchIcon, searchIcons };
