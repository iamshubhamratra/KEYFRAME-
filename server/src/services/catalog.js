// Loader for the HyperFrames registry catalog
// (https://hyperframes.heygen.com/catalog — served from GitHub).
//
// 50 pre-built items we can reference from our LLM-generated compositions:
//   * 8 examples (full styled compositions to adapt)
//   * 39 blocks (sub-compositions: social cards, transitions, data-chart, logos)
//   * 3 components (CSS/JS snippets)
//
// We fetch registry.json at startup (cached in memory), expose a concise
// summary for the composer prompt, and on demand fetch + install any
// block the LLM references via `data-composition-src` in the output.

const fs = require("node:fs");
const path = require("node:path");

const REPO = "heygen-com/hyperframes";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const REGISTRY_URL = `${RAW_BASE}/registry/registry.json`;

let registryCache = null;     // { items: [...], byName: Map }
let registryPromise = null;
const itemFilesCache = new Map(); // name -> { files: [{path, url, bytes}] }

function log(...args) { console.log("[catalog]", ...args); }

async function fetchText(url, timeoutMs = 20_000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "video-gen/1.0" },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally { clearTimeout(t); }
}

async function loadRegistry() {
  if (registryCache) return registryCache;
  if (registryPromise) return registryPromise;
  registryPromise = (async () => {
    try {
      const text = await fetchText(REGISTRY_URL);
      const manifest = JSON.parse(text);
      const items = manifest.items || [];
      const byName = new Map(items.map((it) => [it.name, it]));
      registryCache = { items, byName };
      log(`loaded registry: ${items.length} items`);
      return registryCache;
    } catch (e) {
      log(`failed to load registry: ${e.message}`);
      registryCache = { items: [], byName: new Map() };
      return registryCache;
    }
  })();
  return registryPromise;
}

/**
 * Concise text summary for the LLM: grouped listing of available items
 * with their kind, dimensions, and duration (where applicable).
 * Kept small (~2 KB) so it doesn't blow the prompt budget.
 */
function summarizeForLlm(cache) {
  const byType = { block: [], example: [], component: [] };
  for (const it of cache.items) {
    const type = (it.type || "").includes("example") ? "example"
               : (it.type || "").includes("component") ? "component"
               : "block";
    byType[type].push(it);
  }

  const block = (it) => {
    const dim = (it.width && it.height) ? `${it.width}x${it.height}` : "";
    const dur = it.duration ? `${it.duration}s` : "";
    const tags = (it.tags || []).slice(0, 3).join(",");
    const parts = [dim, dur, tags].filter(Boolean).join(" ");
    return `  - ${it.name}${parts ? `  [${parts}]` : ""}`;
  };

  const sections = [];
  if (byType.block.length) sections.push(
    `BLOCKS (standalone sub-compositions; include via data-composition-src):\n` +
    byType.block.map(block).join("\n")
  );
  if (byType.example.length) sections.push(
    `EXAMPLES (full compositions with style — study for inspiration, don't install):\n` +
    byType.example.map(block).join("\n")
  );
  if (byType.component.length) sections.push(
    `COMPONENTS (snippets — paste HTML/CSS/JS into host composition):\n` +
    byType.component.map(block).join("\n")
  );
  return sections.join("\n\n");
}

async function getCatalogSummary() {
  const cache = await loadRegistry();
  return summarizeForLlm(cache);
}

/**
 * Extract block names the LLM referenced via data-composition-src="compositions/<name>.html".
 * Returns an array of unique block names.
 */
function extractReferencedBlocks(indexHtml) {
  const names = new Set();
  const re = /data-composition-src\s*=\s*["']compositions\/([^"'/]+)\.html["']/gi;
  let m;
  while ((m = re.exec(indexHtml)) !== null) names.add(m[1]);
  return [...names];
}

// Map the top-level type (from registry.json) to its subdirectory under /registry.
function itemTypeDir(item) {
  const t = (item.type || "").toLowerCase();
  if (t.includes("block"))     return "blocks";
  if (t.includes("component")) return "components";
  if (t.includes("example"))   return "examples";
  return "blocks"; // fallback
}

async function fetchItemFiles(name) {
  if (itemFilesCache.has(name)) return itemFilesCache.get(name);

  const cache = await loadRegistry();
  const item = cache.byName.get(name);
  if (!item) {
    log(`unknown catalog item: "${name}"`);
    return null;
  }

  const itemDir = `registry/${itemTypeDir(item)}/${name}`;
  const itemMetaUrl = `${RAW_BASE}/${itemDir}/registry-item.json`;

  try {
    const manifestText = await fetchText(itemMetaUrl);
    const manifest = JSON.parse(manifestText);
    const files = manifest.files || [];
    const rec = { item, itemDir, files };
    itemFilesCache.set(name, rec);
    return rec;
  } catch (e) {
    log(`failed to load "${name}" registry-item.json from ${itemMetaUrl}: ${e.message}`);
    itemFilesCache.set(name, null);
    return null;
  }
}

/**
 * Install a single catalog block into the job directory.
 * Copies all files listed in the item's registry-item.json into the
 * target paths (typically `compositions/<name>.html` + support files).
 * Returns true on success, false otherwise (non-fatal — renderer falls
 * back to standalone composition if block missing).
 */
async function installBlock(name, jobDir) {
  const rec = await fetchItemFiles(name);
  if (!rec) return false;
  let writtenCount = 0;
  for (const f of rec.files) {
    const sourcePath = f.path || f.name;
    const targetRel = f.target || f.path || f.name;
    const srcUrl = `${RAW_BASE}/${rec.itemDir}/${sourcePath}`;
    const targetAbs = path.join(jobDir, targetRel);
    try {
      fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
      const body = await fetchText(srcUrl);
      fs.writeFileSync(targetAbs, body);
      writtenCount++;
    } catch (e) {
      log(`install ${name}: failed to fetch ${srcUrl}: ${e.message}`);
    }
  }
  log(`installed "${name}": ${writtenCount}/${rec.files.length} files → ${jobDir}`);
  return writtenCount > 0;
}

/**
 * Install every block the LLM referenced. Non-fatal — if any install
 * fails, render will skip that block or show a placeholder.
 */
async function installReferencedBlocks(indexHtml, jobDir) {
  const names = extractReferencedBlocks(indexHtml);
  if (!names.length) return { installed: [], failed: [] };
  log(`installing ${names.length} referenced block(s): ${names.join(", ")}`);
  const results = await Promise.all(
    names.map((n) => installBlock(n, jobDir).then((ok) => ({ name: n, ok })))
  );
  return {
    installed: results.filter((r) => r.ok).map((r) => r.name),
    failed:    results.filter((r) => !r.ok).map((r) => r.name),
  };
}

/**
 * Warm the registry cache at server startup so first composer call
 * has the summary available instantly.
 */
function warmUp() {
  return loadRegistry();
}

module.exports = {
  loadRegistry,
  getCatalogSummary,
  extractReferencedBlocks,
  installBlock,
  installReferencedBlocks,
  warmUp,
};
