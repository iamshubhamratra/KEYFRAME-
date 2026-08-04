// Pixabay payload → the normalized Asset shape.
//
// Every field a consumer reads is produced HERE, so no caller ever touches a Pixabay-specific
// property name (`webformatURL`, `picture_id`, `videos.large.url`). That is the whole
// contract that lets a future Pexels provider drop in behind the same service.
//
// `url` is always the DOWNLOADABLE asset, never the landing page — a distinction Pixabay's
// own payloads blur (`pageURL` sits next to `largeImageURL`), and getting it wrong yields a
// film with HTML where a picture should be.

/** @typedef {import('./types').Asset} Asset */

const LICENSE = "Pixabay Content License";
const str = (v) => (v == null ? "" : String(v));
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const tagsOf = (v) => str(v).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

/** @returns {Asset} */
function mapImage(hit) {
  return {
    id: str(hit.id),
    provider: "pixabay",
    type: "image",
    // Pixabay images carry no title; tags are the only human label available.
    title: tagsOf(hit.tags).slice(0, 3).join(", "),
    // fullHDURL (1920px) when the account exposes it, else largeImageURL (1280px);
    // webformatURL is only a 640px preview and cannot fill a 1080-wide frame full-bleed.
    url: str(hit.fullHDURL || hit.largeImageURL || hit.webformatURL || hit.previewURL),
    thumbnail: str(hit.previewURL) || null,
    width: num(hit.imageWidth) || num(hit.webformatWidth),
    height: num(hit.imageHeight) || num(hit.webformatHeight),
    duration: null,
    tags: tagsOf(hit.tags),
    score: 0,
    pageUrl: str(hit.pageURL) || null,
    license: LICENSE,
    raw: hit,
  };
}

/** @returns {Asset} */
function mapVideo(hit) {
  // `videos` is an object of renditions, largest first by convention but not guaranteed —
  // pick by declared width rather than trusting key order.
  const renditions = Object.values(hit.videos || {}).filter((v) => v && v.url);
  const best = renditions.sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0] || {};
  return {
    id: str(hit.id),
    provider: "pixabay",
    type: "video",
    title: tagsOf(hit.tags).slice(0, 3).join(", "),
    url: str(best.url),
    // Pixabay serves no video thumbnail field; the documented CDN pattern derives one.
    thumbnail: hit.picture_id ? `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg` : null,
    width: num(best.width),
    height: num(best.height),
    duration: num(hit.duration),
    tags: tagsOf(hit.tags),
    score: 0,
    pageUrl: str(hit.pageURL) || null,
    license: LICENSE,
    raw: hit,
  };
}

/**
 * Audio (music + SFX) reaches us from the BRIDGE, not the official API — Pixabay's API
 * serves no audio at all. The bridge returns a scraped `{ mp3Url, pageTitle, … }`, so this
 * normalizes that shape into the same Asset envelope.
 * @returns {Asset}
 */
function mapAudio(hit, type) {
  return {
    id: str(hit.id || hit.mp3Url || "").split("/").pop().replace(/\.mp3$/, ""),
    provider: "pixabay",
    type: type === "sfx" ? "sfx" : "music",
    title: str(hit.pageTitle || hit.query || ""),
    url: str(hit.mp3Url),
    thumbnail: null,
    width: null,
    height: null,
    duration: num(hit.duration),
    tags: tagsOf(hit.tags || hit.query),
    score: 0,
    pageUrl: str(hit.url) || null,
    license: LICENSE,
    raw: hit,
  };
}

/** @returns {Asset[]} */
function mapMany(payload, type) {
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];
  const fn = type === "video" ? mapVideo : mapImage;
  return hits.map(fn).filter((a) => a.url);
}

module.exports = { mapImage, mapVideo, mapAudio, mapMany, LICENSE };
