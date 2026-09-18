// VIDEO EDIT RAW PEXELS — video + photo search mapped to RawAsset, nothing thrown away.
//
// WHY THIS EXISTS. services/asset_sources/pexels.js serves the template pipeline and keeps one URL
// per hit. B-roll scoring needs everything: every mp4 rendition (to pick the one nearest the export
// size), duration and fps, the provider's ordered video pictures (25/50/75 % contact-sheet strips
// without downloading video), the page slug (Pexels videos have no title or tags — the slug IS the
// text), the author for credits and the provider rank for the prior. That module stays untouched.
//
// CONTRACT:
//   search({ query, kind:'video'|'image', orientation:'portrait'|'landscape'|'square'|null, perPage, page,
//            signal, fetch, apiKey, timeoutMs, lang? }) -> { items:RawAsset[], rateLimit, total, rejected }
//   `lang` es/fr/de/pt/ja → Pexels `locale` (es-ES, fr-FR, de-DE, pt-BR, ja-JP). Photo `text` is the slug only
//   (`alt` is its own field — repeating it in `text` counted every alt word twice).
//   buildRequest(opts) -> { url, headers } · mapVideo(v, meta) · mapPhoto(p, meta) · orientationParam(o)
//   name 'pexels' · kinds ['video','image'] · needsKey true
// Auth: `Authorization: <key>` header. Limits: 200 req/h (X-Ratelimit-* headers, reset = epoch seconds).

const H = require("./http");

const name = "pexels";
const kinds = Object.freeze(["video", "image"]);
const BASE = "https://api.pexels.com";
const LICENSE = Object.freeze({ license: "Pexels License", licenseCode: "pexels", licenseUrl: "https://www.pexels.com/license/", attributionRequired: false });

function orientationParam(o) {
  return o === "portrait" || o === "landscape" || o === "square" ? o : null;
}

const LOCALES = Object.freeze({ es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR", ja: "ja-JP" });

function buildRequest({ query, kind = "video", orientation = null, perPage = 15, page = 1, apiKey = "", lang = null } = {}) {
  const u = new URL(kind === "image" ? `${BASE}/v1/search` : `${BASE}/videos/search`);
  u.searchParams.set("query", String(query || "").slice(0, 100));
  const locale = typeof lang === "string" ? LOCALES[lang.slice(0, 2).toLowerCase()] : null;
  if (locale) u.searchParams.set("locale", locale);
  u.searchParams.set("per_page", String(H.clampInt(perPage, 1, 80, 15)));
  u.searchParams.set("page", String(H.clampInt(page, 1, 1000, 1)));
  const o = orientationParam(orientation);
  if (o) u.searchParams.set("orientation", o);
  return { url: u.toString(), headers: { Authorization: String(apiKey || "") } };
}

function author(u) {
  const nm = u && typeof u.name === "string" ? u.name.slice(0, 120) : null;
  return { name: nm, url: H.httpsUrl(u && u.url) };
}

function mapVideo(v, { rank = null } = {}) {
  if (!v || v.id == null) return null;
  const renditions = (Array.isArray(v.video_files) ? v.video_files : [])
    .filter((f) => f && /^video\/mp4$/i.test(String(f.file_type || "")) && H.num(f.width) > 0 && H.num(f.height) > 0 && H.httpsUrl(f.link))
    .map((f) => ({
      quality: f.quality || null, width: H.num(f.width), height: H.num(f.height), fps: H.num(f.fps),
      fileType: "video/mp4", url: H.httpsUrl(f.link), sizeBytes: H.num(f.size),
    }))
    .sort(H.bySize);
  if (!renditions.length) return null;
  const pictures = (Array.isArray(v.video_pictures) ? v.video_pictures : [])
    .filter((p) => p && H.httpsUrl(p.picture))
    .sort((a, b) => (H.num(a.nr) || 0) - (H.num(b.nr) || 0))
    .map((p) => H.httpsUrl(p.picture));
  const largest = renditions[renditions.length - 1];
  const fpsList = renditions.map((r) => r.fps).filter((x) => x > 0);
  const who = author(v.user);
  return {
    provider: name, providerId: String(v.id), key: `${name}:${v.id}`, type: "video",
    title: null, alt: null,
    tags: Array.isArray(v.tags) ? v.tags.filter((t) => typeof t === "string").map((t) => t.toLowerCase()).slice(0, 30) : [],
    text: H.slugWords(v.url),
    width: H.num(v.width) || largest.width, height: H.num(v.height) || largest.height,
    durationSec: H.num(v.duration), fps: fpsList.length ? Math.max(...fpsList) : null,
    renditions,
    thumbnail: H.httpsUrl(v.image) || pictures[0] || null,
    pictures, thumbs: [...new Set([H.httpsUrl(v.image), ...pictures].filter(Boolean))],
    strip: H.stripOf(pictures), previewUrl: renditions[0].url,
    pageUrl: H.httpsUrl(v.url), author: who,
    ...LICENSE,
    attribution: who.name ? `Video by ${who.name} on Pexels` : "Video from Pexels",
    avgColor: null, rank,
  };
}

function mapPhoto(p, { rank = null } = {}) {
  if (!p || p.id == null) return null;
  const src = p.src || {};
  const W = H.num(p.width), Hh = H.num(p.height);
  const dims = (s) => (W && Hh ? { width: Math.round(W * s), height: Math.round(Hh * s) } : { width: null, height: null });
  const fit = (bw, bh) => dims(W && Hh ? Math.min(1, bw / W, bh / Hh) : 1);
  const byH = (h) => dims(Hh ? Math.min(1, h / Hh) : 1);
  const renditions = [
    ["small", src.small, byH(130)], ["medium", src.medium, byH(350)], ["large", src.large, fit(940, 650)],
    ["large2x", src.large2x, fit(1880, 1300)], ["original", src.original, { width: W, height: Hh }],
  ]
    .filter(([, url]) => H.httpsUrl(url))
    .map(([quality, url, d]) => ({ quality, width: d.width, height: d.height, fps: null, fileType: H.fileTypeFromUrl(url), url: H.httpsUrl(url), sizeBytes: null }))
    .sort(H.bySize);
  if (!renditions.length) return null;
  const who = { name: typeof p.photographer === "string" ? p.photographer.slice(0, 120) : null, url: H.httpsUrl(p.photographer_url) };
  const alt = typeof p.alt === "string" && p.alt.trim() ? p.alt.trim().slice(0, 300) : null;
  return {
    provider: name, providerId: String(p.id), key: `${name}:${p.id}`, type: "image",
    title: null, alt, tags: [],
    text: H.slugWords(p.url),
    width: W, height: Hh, durationSec: null, fps: null,
    renditions,
    thumbnail: H.httpsUrl(src.medium) || H.httpsUrl(src.small) || renditions[0].url,
    pictures: [], thumbs: [H.httpsUrl(src.medium) || H.httpsUrl(src.small) || renditions[0].url], strip: null, previewUrl: null,
    pageUrl: H.httpsUrl(p.url), author: who,
    ...LICENSE,
    attribution: who.name ? `Photo by ${who.name} on Pexels` : "Photo from Pexels",
    avgColor: typeof p.avg_color === "string" && /^#[0-9a-f]{6}$/i.test(p.avg_color) ? p.avg_color.toUpperCase() : null,
    rank,
  };
}

async function search({ query, kind = "video", orientation = null, perPage = 15, page = 1, signal = null, fetch = null, apiKey = "", timeoutMs = 15000, lang = null } = {}) {
  if (!apiKey) throw H.unconfigured(name);
  const req = buildRequest({ query, kind, orientation, perPage, page, apiKey, lang });
  const { json, rateLimit } = await H.getJson({ provider: name, url: req.url, headers: req.headers, fetch, signal, timeoutMs, resetMode: "epoch" });
  const per = H.clampInt(perPage, 1, 80, 15);
  const base = (H.clampInt(page, 1, 1000, 1) - 1) * per;
  const list = kind === "image" ? json.photos : json.videos;
  const items = [];
  let rejected = 0;
  (Array.isArray(list) ? list : []).forEach((raw, i) => {
    const it = kind === "image" ? mapPhoto(raw, { rank: base + i + 1 }) : mapVideo(raw, { rank: base + i + 1 });
    if (it) items.push(it); else rejected++;
  });
  return { items, rateLimit, total: H.num(json.total_results), rejected: { malformed: rejected } };
}

module.exports = { name, kinds, needsKey: true, search, buildRequest, mapVideo, mapPhoto, orientationParam, LICENSE, LOCALES };
