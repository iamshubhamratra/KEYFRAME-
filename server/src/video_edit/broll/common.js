// VIDEO EDIT B-ROLL SCORING HELPERS — small pure utilities shared by slots, prior, sheet, judge and score.
//
// WHY THIS EXISTS. Scoring touches candidates from three providers whose search mappers are written
// elsewhere (broll/providers/*_raw.js, ANALYSIS.md §8), and the scoring modules must agree on the
// few things that make results reproducible: one normalized candidate shape (so a missing tag field
// or a string author never crashes a stage), one stable asset id per provider item (so a resumed run
// writes the same candidate files), and one seeded shuffle (so the contact-sheet letters the judge
// sees are the letters the scorer maps back — a different order would silently score the wrong clip).
//
// CONTRACT (pure, deterministic):
//   isPlain · num(v) -> finite|null · clamp(v, lo, hi) · clamp01(v) · round(v, digits=4)
//   sha1(s) · seedFrom(str) -> uint32 · seededShuffle(arr, seedStr) -> new array · letterFor(i) -> 'A'..'Z','AA'…
//   assetIdFor(provider, providerId) -> 'ast_<2 provider chars><14 hex>'
//   safeSlotId(id) -> id usable as a file name ([A-Za-z0-9_-], ≤ 48) | null
//   normalizeCandidate(raw, index) -> Candidate | null
//     Candidate = { key:'<provider>:<providerId>', assetId, provider, providerId, type:'video'|'image', width, height,
//       durationSec|null, renditions:[{quality, width, height, fps, link}], thumbs:[https], pictures:[https], strip:[https ≤3],
//       pageUrl|null, author:{name, url}|null, title|null, alt|null, text (slug words), tags:[≤60], localizedTags:[≤60],
//       license, licenseCode|null, licenseUrl|null, attributionRequired, shareAlike, attribution (≤ 300, never cut
//       inside a URL), attributionFull (≤ 1000), query|null, rank:int, dominantColor:'#RRGGBB'|null }
//   cutText(s, max) -> s truncated at max, backing off to before a URL the cut would split
//   cancelledError(detail) · throwIfAborted(signal)

const crypto = require("node:crypto");
const { EditError } = require("../errors");

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function num(v) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(Number.isFinite(v) ? v : 0, 0, 1);
function round(v, digits = 4) {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
function seedFrom(str) { return parseInt(sha1(str).slice(0, 8), 16) >>> 0; }

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seed) {
  const out = Array.isArray(arr) ? [...arr] : [];
  const rnd = mulberry32(seedFrom(String(seed)));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function letterFor(i) {
  let n = Math.max(0, Math.floor(i));
  let s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

const PROVIDERS = Object.freeze(["pexels", "pixabay", "openverse"]);

function assetIdFor(provider, providerId) {
  return `ast_${String(provider).slice(0, 2)}${sha1(`${provider}:${providerId}`).slice(0, 14)}`;
}

function safeSlotId(id) {
  const s = String(id == null ? "" : id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
  return /^[A-Za-z0-9_-]{1,48}$/.test(s) ? s : null;
}

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// Truncate free text without leaving half a URL behind (a cut licence link is worse than none).
function cutText(s, max) {
  const t = String(s == null ? "" : s);
  if (t.length <= max) return t;
  let cut = t.slice(0, max);
  const m = /https?:\/\/\S*$/i.exec(cut);
  if (m && !/\s/.test(t.charAt(max))) cut = cut.slice(0, m.index);
  return cut.replace(/[\s,;:(—-]+$/u, "").trim();
}
const httpsUrl = (v) => {
  const s = str(v, 2048);
  return s && /^https:\/\/[^\s]+$/i.test(s) ? s : null;
};

function tagList(raw) {
  let items = [];
  if (typeof raw === "string") items = raw.split(/[,;|]/);
  else if (Array.isArray(raw)) items = raw.map((t) => (typeof t === "string" ? t : (isPlain(t) ? (t.name || t.title || "") : "")));
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const t = String(it || "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 60) break;
  }
  return out;
}

// "https://www.pexels.com/video/woman-typing-on-laptop-3196344/" -> "woman typing on laptop"
function slugWords(pageUrl) {
  const s = httpsUrl(pageUrl);
  if (!s) return "";
  try {
    const segs = new URL(s).pathname.split("/").filter(Boolean);
    let last = segs[segs.length - 1] || "";
    try { last = decodeURIComponent(last); } catch { /* keep raw */ }
    last = last.replace(/^id-/, "").replace(/[-_]?\d+$/, "");
    return last.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  } catch { return ""; }
}

const DEFAULT_LICENSE = Object.freeze({ pexels: "Pexels License", pixabay: "Pixabay Content License", openverse: "Creative Commons (see source)" });

function openverseLicense(raw) {
  const lic = str(raw.license, 40);
  if (!lic) return null;
  if (!/^[a-z0-9-]{2,12}$/i.test(lic)) return lic.slice(0, 120);
  const v = str(raw.license_version || raw.licenseVersion, 10);
  if (/^cc0$/i.test(lic)) return "CC0 1.0";
  if (/^pdm$/i.test(lic)) return "Public Domain Mark 1.0";
  return `CC ${lic.toUpperCase()}${v ? ` ${v}` : ""}`;
}

function defaultAttribution(provider, type, author, title, license) {
  const who = author && author.name;
  if (provider === "pexels") return who ? `${type === "video" ? "Video" : "Photo"} by ${who} on Pexels` : "Pexels";
  if (provider === "pixabay") return who ? `${who} on Pixabay` : "Pixabay";
  return `${title ? `"${title}"` : "Image"}${who ? ` by ${who}` : ""}${license ? ` (${license})` : ""}`;
}

function normalizeCandidate(raw, index = 0) {
  if (!isPlain(raw)) return null;
  const provider = String(raw.provider || "").toLowerCase();
  if (!PROVIDERS.includes(provider)) return null;
  const providerId = raw.providerId == null || raw.providerId === "" ? null : String(raw.providerId).slice(0, 120);
  if (!providerId) return null;
  const type = raw.type === "image" ? "image" : (raw.type === "video" ? "video" : null);
  if (!type) return null;

  const renditions = (Array.isArray(raw.renditions) ? raw.renditions : [])
    .filter(isPlain)
    .map((r) => ({
      quality: str(r.quality, 20), width: Math.max(0, Math.round(num(r.width) || 0)), height: Math.max(0, Math.round(num(r.height) || 0)),
      fps: num(r.fps), link: httpsUrl(r.link || r.url),
    }))
    .filter((r) => r.link || (r.width > 0 && r.height > 0))
    .slice(0, 12);

  let width = Math.max(0, Math.round(num(raw.width) || 0));
  let height = Math.max(0, Math.round(num(raw.height) || 0));
  if (!(width > 0 && height > 0)) {
    const big = [...renditions].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (big && big.width > 0 && big.height > 0) { width = big.width; height = big.height; }
  }

  const listOf = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
  const urlOf = (t) => httpsUrl(isPlain(t) ? (t.url || t.picture) : t);
  // broll/providers/*_raw.js emit `thumbnail` (one URL) + `strip` (25/50/75 % picks); older mappers `thumbs[]`.
  const thumbs = [...new Set([raw.thumbnail, ...listOf(raw.thumbs)].map(urlOf).filter(Boolean))].slice(0, 20);
  const pictures = [...new Set(listOf(raw.pictures).map(urlOf).filter(Boolean))].slice(0, 30);
  const strip = listOf(raw.strip).map(urlOf).filter(Boolean)
    .filter((u, i, a) => i === 0 || u !== a[i - 1]).slice(0, 3);

  let author = null;
  if (isPlain(raw.author)) author = { name: str(raw.author.name, 120), url: httpsUrl(raw.author.url) };
  else if (typeof raw.author === "string") author = { name: str(raw.author, 120), url: null };
  if (author && !author.name && !author.url) author = null;

  const pageUrl = httpsUrl(raw.pageUrl || raw.sourceUrl);
  const title = str(raw.title, 300);
  const license = (provider === "openverse" ? openverseLicense(raw) : str(raw.license, 120)) || DEFAULT_LICENSE[provider];
  const attributionFull = str(raw.attribution, 1000) || defaultAttribution(provider, type, author, title, license);
  const attribution = cutText(attributionFull, 300);
  const licenseCode = str(raw.licenseCode || (provider === "openverse" ? raw.license : null), 20);
  const lc = licenseCode ? licenseCode.toLowerCase() : null;
  // 0-based rank for the prior. Retrieval's merged `searchRank` and the raw mappers' `rank` are 1-based.
  let rank = Math.max(0, Math.floor(index));
  if (Number.isInteger(raw.searchRank) && raw.searchRank >= 1) rank = raw.searchRank - 1;
  else if (Number.isInteger(raw.rank) && raw.rank >= 1) rank = raw.rank - 1;
  else if (raw.rank === 0) rank = 0;
  const color = typeof raw.avgColor === "string" && /^#[0-9a-f]{6}$/i.test(raw.avgColor) ? raw.avgColor.toUpperCase() : null;

  return {
    key: `${provider}:${providerId}`,
    assetId: assetIdFor(provider, providerId),
    provider, providerId, type, width, height,
    durationSec: type === "video" ? num(raw.durationSec) : null,
    renditions, thumbs, pictures, strip, pageUrl, author, title,
    alt: str(raw.alt, 300),
    // A mapper's explicit text (even '') wins: the raw mappers already decided what the slug adds.
    text: typeof raw.text === "string" ? (str(raw.text, 300) || "") : slugWords(pageUrl),
    tags: tagList(raw.tags),
    localizedTags: tagList(raw.localizedTags),
    license: license.slice(0, 120),
    licenseCode: lc,
    licenseUrl: httpsUrl(raw.licenseUrl || raw.license_url),
    attributionRequired: raw.attributionRequired === true || lc === "by" || lc === "by-sa",
    shareAlike: raw.shareAlike === true || lc === "by-sa",
    attribution,
    attributionFull,
    query: str(raw.query, 120),
    rank,
    dominantColor: color,
  };
}

function cancelledError(detail = "aborted") {
  return new EditError("CANCELLED", { status: 409, errorClass: "cancelled", detail });
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw cancelledError("broll scoring aborted");
}

module.exports = {
  isPlain, num, clamp, clamp01, round, sha1, seedFrom, seededShuffle, letterFor, assetIdFor, safeSlotId,
  normalizeCandidate, tagList, slugWords, cutText, PROVIDERS, cancelledError, throwIfAborted,
};
