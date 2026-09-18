// VIDEO EDIT RAW PIXABAY — video + photo search mapped to RawAsset.
//
// WHY THIS EXISTS. services/asset_sources/pixabay_api.js keeps one rendition per hit for the template
// pipeline. B-roll needs all renditions (tiny → large, each with its thumbnail), duration, tags, the
// uploader for credits and the rank. Pixabay has no video orientation filter — orientation is judged
// from the rendition dimensions by the caller. A rejected key is a `config` failure here (the breaker
// latches the provider for an hour); the template module's own latch is also honoured by search.js.
//
// CONTRACT:
//   search({ query, kind:'video'|'image', orientation, perPage (3..200), page, signal, fetch, apiKey, timeoutMs,
//            videoType='film', imageType='photo', lang? }) -> { items:RawAsset[], rateLimit, total, rejected }
//   `lang` (es/fr/de/pt/ja…) localizes the query; `text` is the page-slug words NOT already in the tags (the
//   slug is built from the tags, and counting them twice made every Pixabay tag hit look perfect).
//   buildRequest(opts) -> { url, headers } · mapVideo(hit, meta) · mapImage(hit, meta) · orientationParam(o)
//   name 'pixabay' · kinds ['video','image'] · needsKey true
// Auth: `key` query parameter (never logged). Limits: 100 req / 60 s (X-RateLimit-Reset = seconds until reset).

const H = require("./http");

const name = "pixabay";
const kinds = Object.freeze(["video", "image"]);
const LICENSE = Object.freeze({
  license: "Pixabay Content License", licenseCode: "pixabay", licenseUrl: "https://pixabay.com/service/license-summary/", attributionRequired: false,
});
const MAX_QUERY_LEN = 100;
const LANGS = new Set(["cs", "da", "de", "en", "es", "fr", "id", "it", "hu", "nl", "no", "pl", "pt", "ro", "sk", "fi", "sv", "tr", "vi", "th", "bg", "ru", "el", "ja", "ko", "zh"]);

function slugBeyondTags(pageUrl, tags) {
  const have = new Set(tags.flatMap((t) => t.split(/\s+/)));
  return H.slugWords(pageUrl).split(" ").filter((w) => w && !have.has(w)).join(" ");
}

function clampQuery(q) {
  const s = String(q || "").trim();
  if (s.length <= MAX_QUERY_LEN) return s;
  const cut = s.slice(0, MAX_QUERY_LEN);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
}

function orientationParam(o) {
  if (o === "portrait") return "vertical";
  if (o === "landscape") return "horizontal";
  return "all";
}

function buildRequest({ query, kind = "video", orientation = null, perPage = 20, page = 1, apiKey = "", videoType = "film", imageType = "photo", lang = null } = {}) {
  const u = new URL(kind === "image" ? "https://pixabay.com/api/" : "https://pixabay.com/api/videos/");
  u.searchParams.set("key", String(apiKey || ""));
  u.searchParams.set("q", clampQuery(query));
  const l = typeof lang === "string" ? lang.slice(0, 2).toLowerCase() : "";
  if (l && l !== "en" && LANGS.has(l)) u.searchParams.set("lang", l);
  u.searchParams.set("per_page", String(H.clampInt(perPage, 3, 200, 20)));
  u.searchParams.set("page", String(H.clampInt(page, 1, 500, 1)));
  u.searchParams.set("safesearch", "true");
  if (kind === "image") {
    u.searchParams.set("image_type", imageType || "photo");
    u.searchParams.set("orientation", orientationParam(orientation));
  } else if (videoType) {
    u.searchParams.set("video_type", videoType);
  }
  return { url: u.toString(), headers: {} };
}

function tagsOf(s) {
  return String(s || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 30);
}

function authorOf(hit) {
  const user = typeof hit.user === "string" && hit.user ? hit.user.slice(0, 120) : null;
  const uid = H.num(hit.user_id);
  return { name: user, url: user && uid ? `https://pixabay.com/users/${encodeURIComponent(user)}-${uid}/` : null };
}

function mapVideo(hit, { rank = null } = {}) {
  if (!hit || hit.id == null) return null;
  const v = hit.videos || {};
  const renditions = ["tiny", "small", "medium", "large"]
    .map((q) => [q, v[q]])
    .filter(([, r]) => r && H.httpsUrl(r.url) && H.num(r.width) > 0 && H.num(r.height) > 0)
    .map(([q, r]) => ({
      quality: q, width: H.num(r.width), height: H.num(r.height), fps: null, fileType: "video/mp4",
      url: H.httpsUrl(r.url), sizeBytes: H.num(r.size), thumbnail: H.httpsUrl(r.thumbnail),
    }))
    .sort(H.bySize);
  if (!renditions.length) return null;
  const largest = renditions[renditions.length - 1];
  const thumbPref = ["medium", "small", "large", "tiny"].map((q) => renditions.find((r) => r.quality === q)).filter(Boolean);
  const thumbnail = (thumbPref.find((r) => r.thumbnail) || {}).thumbnail
    || (H.num(hit.picture_id) || typeof hit.picture_id === "string" ? H.httpsUrl(`https://i.vimeocdn.com/video/${encodeURIComponent(hit.picture_id)}_640x360.jpg`) : null);
  const who = authorOf(hit);
  const tags = tagsOf(hit.tags);
  return {
    provider: name, providerId: String(hit.id), key: `${name}:${hit.id}`, type: "video",
    title: null, alt: null, tags,
    text: slugBeyondTags(hit.pageURL, tags),
    width: largest.width, height: largest.height, durationSec: H.num(hit.duration), fps: null,
    renditions,
    thumbnail: thumbnail || null,
    // Pixabay thumbnails are one frame at several sizes — no 25/50/75 % strip; scoring previews the tiny rendition.
    pictures: [], thumbs: thumbnail ? [thumbnail] : [], strip: null, previewUrl: renditions[0].url,
    pageUrl: H.httpsUrl(hit.pageURL), author: who,
    ...LICENSE,
    attribution: who.name ? `Video by ${who.name} from Pixabay` : "Video from Pixabay",
    avgColor: null, rank,
  };
}

function mapImage(hit, { rank = null } = {}) {
  if (!hit || hit.id == null) return null;
  const W = H.num(hit.imageWidth), Hh = H.num(hit.imageHeight);
  const longFit = (edge) => {
    if (!(W > 0 && Hh > 0)) return { width: null, height: null };
    const s = Math.min(1, edge / Math.max(W, Hh));
    return { width: Math.round(W * s), height: Math.round(Hh * s) };
  };
  const renditions = [
    ["preview", hit.previewURL, { width: H.num(hit.previewWidth), height: H.num(hit.previewHeight) }],
    ["webformat", hit.webformatURL, { width: H.num(hit.webformatWidth), height: H.num(hit.webformatHeight) }],
    ["large", hit.largeImageURL, longFit(1280)],
    ["fullhd", hit.fullHDURL, longFit(1920)],
    ["original", hit.imageURL, { width: W, height: Hh }],
  ]
    .filter(([, url]) => H.httpsUrl(url))
    .map(([quality, url, d]) => ({ quality, width: d.width, height: d.height, fps: null, fileType: H.fileTypeFromUrl(url), url: H.httpsUrl(url), sizeBytes: quality === "original" ? H.num(hit.imageSize) : null }))
    .sort(H.bySize);
  if (!renditions.length) return null;
  const who = authorOf(hit);
  const tags = tagsOf(hit.tags);
  return {
    provider: name, providerId: String(hit.id), key: `${name}:${hit.id}`, type: "image",
    title: null, alt: null, tags,
    text: slugBeyondTags(hit.pageURL, tags),
    width: W, height: Hh, durationSec: null, fps: null,
    renditions,
    thumbnail: H.httpsUrl(hit.webformatURL) || H.httpsUrl(hit.previewURL) || renditions[0].url,
    pictures: [], thumbs: [H.httpsUrl(hit.webformatURL) || H.httpsUrl(hit.previewURL) || renditions[0].url], strip: null, previewUrl: null,
    pageUrl: H.httpsUrl(hit.pageURL), author: who,
    ...LICENSE,
    attribution: who.name ? `Image by ${who.name} from Pixabay` : "Image from Pixabay",
    avgColor: null, rank,
  };
}

async function search({
  query, kind = "video", orientation = null, perPage = 20, page = 1, signal = null, fetch = null, apiKey = "",
  timeoutMs = 15000, videoType = "film", imageType = "photo", lang = null,
} = {}) {
  if (!apiKey) throw H.unconfigured(name);
  const req = buildRequest({ query, kind, orientation, perPage, page, apiKey, videoType, imageType, lang });
  const { json, rateLimit } = await H.getJson({ provider: name, url: req.url, headers: req.headers, fetch, signal, timeoutMs, resetMode: "delta" });
  const per = H.clampInt(perPage, 3, 200, 20);
  const base = (H.clampInt(page, 1, 500, 1) - 1) * per;
  const items = [];
  let rejected = 0;
  (Array.isArray(json.hits) ? json.hits : []).forEach((hit, i) => {
    const it = kind === "image" ? mapImage(hit, { rank: base + i + 1 }) : mapVideo(hit, { rank: base + i + 1 });
    if (it) items.push(it); else rejected++;
  });
  return { items, rateLimit, total: H.num(json.totalHits), rejected: { malformed: rejected } };
}

module.exports = { name, kinds, needsKey: true, search, buildRequest, mapVideo, mapImage, orientationParam, clampQuery, LICENSE };
