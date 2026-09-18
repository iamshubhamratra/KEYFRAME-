// VIDEO EDIT CREDITS — credits.txt for every third-party asset an export actually uses.
//
// WHY THIS EXISTS. Pexels and Pixabay do not require attribution but ask for it; Openverse CC BY / CC BY-SA
// images and CC-BY sound effects DO require it, with creator, licence and source. The only reliable place
// to decide "used" is the plan being exported: a candidate that was scored but never chosen, or a B-roll
// item the user removed, must not be credited, and a chosen asset used twice is credited once. Author
// profile links are not part of AssetRef, so they are recovered from the scored candidate details
// (`broll/candidates/*.json`) when the project dir is known, else parsed from the attribution string.
// Every field is untrusted provider text: control characters and line separators are replaced and lengths
// capped, so a crafted title cannot inject extra lines into the file.
//
// CONTRACT:
//   buildCreditLines(plan, { details?:{ [assetId]: { author:{name,url} } } }) -> { lines:string[], counts:{ broll, music, sfx } }
//     B-roll: items with status ok|pending, enabled !== false, a stock `chosen` (pexels|pixabay|openverse), once per assetId.
//     Music: plan.music enabled with a non-synth, non-user track. SFX: enabled entries that carry an attribution.
//   collectDetails(projectDir) -> { [assetId]: { author } }
//   writeCredits(plan, projectDir, { rel='credits.txt' }?) -> { path, lines, counts, bytes }

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../fsx");
const { isPlain } = require("./common");

const CREDIT_STATUSES = new Set(["ok", "pending"]);
const STOCK = Object.freeze({ pexels: "Pexels", pixabay: "Pixabay", openverse: "Openverse" });
const MUSIC_PROVIDERS = Object.freeze({ pixabay_bridge: "Pixabay" });

function stripCtl(s) {
  return Array.from(s, (ch) => {
    const c = ch.codePointAt(0);
    return c < 32 || c === 127 || c === 8232 || c === 8233 ? " " : ch;
  }).join("");
}
const clean = (v, max = 300) => (typeof v === "string" ? stripCtl(v).split(" ").filter(Boolean).join(" ").slice(0, max) : "");
const httpsUrl = (v) => (typeof v === "string" && v.length <= 2048 && /^https:\/\/[^\s]+$/i.test(v) ? v : "");

function collectDetails(projectDir) {
  const out = {};
  let dir;
  try { dir = fsx.resolveInside(projectDir, "broll/candidates"); } catch { return out; }
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.json$/i.test(f)).sort(); } catch { return out; }
  for (const f of files) {
    const r = fsx.readJsonSafe(path.join(dir, f));
    const details = r.ok && isPlain(r.value) && isPlain(r.value.details) ? r.value.details : {};
    for (const [assetId, d] of Object.entries(details)) {
      if (!out[assetId] && isPlain(d) && isPlain(d.author)) out[assetId] = { author: { name: d.author.name || null, url: d.author.url || null } };
    }
  }
  return out;
}

function authorFrom(ref, details) {
  const d = details && details[ref.assetId];
  let name = d && d.author ? clean(d.author.name, 120) : "";
  const url = d && d.author ? httpsUrl(d.author.url) : "";
  if (!name) {
    const m = /\bby (.+?)(?: (?:on|from) (?:Pexels|Pixabay)\b|$)/i.exec(clean(ref.attribution));
    if (m) name = clean(m[1], 120);
  }
  return { name, url };
}

function brollLine(ref, details) {
  const label = STOCK[ref.provider];
  const kind = ref.type === "image" ? (ref.provider === "pexels" ? "Photo" : "Image") : "Video";
  const src = httpsUrl(ref.sourceUrl);
  const license = clean(ref.license, 120);
  const { name, url } = authorFrom(ref, details);
  if (ref.provider === "openverse") {
    const attribution = clean(ref.attribution) || `${kind}${name ? ` by ${name}` : ""}`;
    return [attribution, license && !attribution.includes(license) ? license : "", src].filter(Boolean).join(" — ");
  }
  const who = name ? `${kind} by ${name}${url ? ` (${url})` : ""} on ${label}` : `${kind} from ${label}`;
  return [who, src, license].filter(Boolean).join(" — ");
}

function buildCreditLines(plan, { details = {} } = {}) {
  const p = isPlain(plan) ? plan : {};
  const broll = [];
  const seen = new Set();
  for (const item of Array.isArray(p.broll) ? p.broll : []) {
    if (!isPlain(item) || item.enabled === false || !CREDIT_STATUSES.has(item.status)) continue;
    const ref = item.chosen;
    if (!isPlain(ref) || !STOCK[ref.provider] || !ref.assetId || seen.has(ref.assetId)) continue;
    seen.add(ref.assetId);
    broll.push(brollLine(ref, details));
  }

  const music = [];
  const m = p.music;
  if (isPlain(m) && m.enabled !== false && isPlain(m.track) && !["synth", "user"].includes(m.track.provider)) {
    const t = m.track;
    music.push([
      clean(t.title, 120) || "Untitled track",
      clean(t.attribution),
      MUSIC_PROVIDERS[t.provider] || clean(t.provider, 40),
      clean(t.license, 120),
      httpsUrl(t.sourceUrl),
    ].filter(Boolean).join(" — "));
  }

  const sfx = [];
  for (const s of Array.isArray(p.sfx) ? p.sfx : []) {
    if (!isPlain(s) || s.enabled === false) continue;
    const attribution = clean(s.attribution);
    if (!attribution) continue; // library effects without an attribution requirement are not listed
    const line = [`${attribution} (${clean(s.cue, 20) || "sound effect"})`, clean(s.license, 120)].filter(Boolean).join(" — ");
    if (!sfx.includes(line)) sfx.push(line);
  }

  const lines = ["Credits", ""];
  if (broll.length) lines.push("Stock footage and images:", ...broll.map((l) => `- ${l}`), "");
  if (music.length) lines.push("Music:", ...music.map((l) => `- ${l}`), "");
  if (sfx.length) lines.push("Sound effects:", ...sfx.map((l) => `- ${l}`), "");
  if (!broll.length && !music.length && !sfx.length) lines.push("No third-party media was used in this video.", "");
  return { lines, counts: { broll: broll.length, music: music.length, sfx: sfx.length } };
}

function writeCredits(plan, projectDir, { rel = "credits.txt" } = {}) {
  if (typeof projectDir !== "string" || !projectDir) throw new TypeError("writeCredits: projectDir required");
  const { lines, counts } = buildCreditLines(plan, { details: collectDetails(projectDir) });
  const body = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  const abs = fsx.resolveInside(projectDir, rel);
  fsx.ensureDir(path.dirname(abs));
  const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, body, "utf8");
  try { fsx.renameWithRetrySync(tmp, abs); } catch (e) { try { fs.unlinkSync(tmp); } catch { /* noop */ } throw e; }
  return { path: rel, lines, counts, bytes: Buffer.byteLength(body) };
}

module.exports = { buildCreditLines, collectDetails, writeCredits };
