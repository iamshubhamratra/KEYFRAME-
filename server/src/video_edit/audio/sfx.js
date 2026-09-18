// VIDEO EDIT SFX — plan cue names → a licensed local file inside the project (RENDER.md §8).
//
// WHY THIS EXISTS. An edit's sound effects must be deterministic (the same cue sounds the same on every
// re-render), offline (a render never waits on the Pixabay bridge — `sfx_library.getSfx` goes to the
// network first, so it is never used here) and credited: several curated cues are CC-BY, so the export's
// credits need the attribution the library manifest records. Files are copied into the project so a
// later library rebuild can never change an existing edit.
//
// CONTRACT:
//   resolveSfx(cue, { projectDir, resolveCue? }) -> { cue, path:'assets/sfx/<cue>.mp3', absPath, license, licenseUrl,
//                                                    attribution:string|null, source, sourceId, sourceName, durationSec } | null
//     cue: any free-text name; mapped by services/sfx_library.resolveCue (aliases, word match). null when nothing
//     matches or the library file is missing (fail-open: the edit simply has no effect there).
//   sfxLibraryEntry(cueName) -> manifest entry | null · licenseLabel(url) -> 'CC0 1.0' | 'CC BY 4.0' | …
//   creditsFor(resolved[]) -> string[] unique attribution lines (CC-BY only)
//   SFX_DIR = server/assets/sfx

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../fsx");
const { EditError } = require("../errors");

const SFX_DIR = path.resolve(__dirname, "..", "..", "..", "assets", "sfx");
let manifestCache = null;

function loadManifest() {
  if (manifestCache) return manifestCache;
  const r = fsx.readJsonSafe(path.join(SFX_DIR, "manifest.json"));
  manifestCache = r.ok && Array.isArray(r.value) ? r.value : [];
  return manifestCache;
}

function sfxLibraryEntry(name) {
  return loadManifest().find((e) => e && e.name === name) || null;
}

function licenseLabel(url) {
  const u = String(url || "").toLowerCase();
  const ver = (u.match(/\/(\d\.\d)\/?$/) || [])[1] || "";
  if (u.includes("publicdomain/zero")) return `CC0 ${ver || "1.0"}`;
  if (u.includes("/licenses/by-sa/")) return `CC BY-SA ${ver}`.trim();
  if (u.includes("/licenses/by-nc/")) return `CC BY-NC ${ver}`.trim();
  if (u.includes("/licenses/by/")) return `CC BY ${ver}`.trim();
  return u ? "See license URL" : "Unknown license";
}

function requiresAttribution(url) { return /creativecommons\.org\/licenses\/by/i.test(String(url || "")); }

function attributionFor(entry) {
  if (!entry || !requiresAttribution(entry.license)) return null;
  const where = entry.source === "freesound" && entry.sourceId ? ` (https://freesound.org/s/${entry.sourceId}/)` : "";
  return `"${String(entry.sourceName || entry.name).slice(0, 120)}" from ${entry.source || "unknown source"}${where}, licensed ${licenseLabel(entry.license)} ${entry.license}`.slice(0, 300);
}

function resolveSfx(cue, { projectDir, resolveCue } = {}) {
  if (typeof projectDir !== "string" || !projectDir) throw new EditError("SFX_PROJECT_REQUIRED", { errorClass: "bug", detail: "projectDir is required" });
  const resolver = resolveCue || require("../../services/sfx_library").resolveCue;
  const name = resolver(cue);
  if (!name || !/^[a-z0-9_-]{1,40}$/.test(name)) return null;
  const src = path.join(SFX_DIR, `${name}.mp3`);
  if (!fs.existsSync(src)) return null;
  const entry = sfxLibraryEntry(name);

  const rel = `assets/sfx/${name}.mp3`;
  const dest = fsx.resolveInside(projectDir, rel);
  fsx.ensureDir(path.dirname(dest));
  const srcSize = fs.statSync(src).size;
  let destSize = -1;
  try { destSize = fs.statSync(dest).size; } catch { /* not copied yet */ }
  if (destSize !== srcSize) {
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.copyFileSync(src, tmp);
    fsx.renameWithRetrySync(tmp, dest);
  }
  const licenseUrl = entry ? entry.license : null;
  return {
    cue: name,
    path: rel,
    absPath: dest,
    license: licenseUrl ? `${licenseLabel(licenseUrl)} (${licenseUrl})`.slice(0, 120) : "Unknown license",
    licenseUrl,
    attribution: attributionFor(entry),
    source: entry ? entry.source : null,
    sourceId: entry ? entry.sourceId : null,
    sourceName: entry ? entry.sourceName : null,
    durationSec: entry && Number.isFinite(entry.durationSec) ? entry.durationSec : null,
  };
}

function creditsFor(list) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) if (r && r.attribution && !out.includes(r.attribution)) out.push(r.attribution);
  return out;
}

module.exports = { resolveSfx, sfxLibraryEntry, licenseLabel, creditsFor, SFX_DIR };
