// VIDEO EDIT RAW OPENVERSE — keyless openly-licensed photo search, commercial-safe licences only.
//
// WHY THIS EXISTS. Openverse is the last stock fallback (ENGINE.md §6) and the only one whose content
// licences vary per item. An exported edit is a commercial use AND an adaptation (cropped, cover-scaled,
// Ken Burns zoom), so by default only CC0 and CC BY survive (ANALYSIS.md §8 `license:'cc0,by'`). CC BY-SA
// (ShareAlike obligations on the adapted edit) and PDM (a label, not a licence grant) are operator opt-ins
// via settings.broll.openverse.licenses and are flagged `shareAlike` / `clearance:'label'` on the item so the
// editor can warn. Anything NonCommercial or NoDerivatives (or sampling+, an unknown licence, mature content)
// is never allowed, even when asked for, because the API's filter is not a guarantee. Attribution text is
// kept verbatim, plus the structured fields (title, creator + url, licence url) credits are built from.
//
// CONTRACT:
//   search({ query, kind:'image', orientation, perPage (1..20 anonymous), page, signal, fetch, timeoutMs,
//            licenses=DEFAULT_LICENSES ['cc0','by'], category='photograph' })
//     -> { items:RawAsset[], rateLimit, total, rejected:{ license, mature, malformed } }
//   buildRequest(opts) -> { url, headers } · mapImage(r, meta) -> RawAsset|null · licenseAllowed(code, allowed)
//   COMMERCIAL_SAFE (the ceiling an operator may opt into) · DEFAULT_LICENSES
//   name 'openverse' · kinds ['image'] · needsKey false

const H = require("./http");

const name = "openverse";
const kinds = Object.freeze(["image"]);
const COMMERCIAL_SAFE = Object.freeze(["cc0", "pdm", "by", "by-sa"]);
const DEFAULT_LICENSES = Object.freeze(["cc0", "by"]);
const LICENSE_NAMES = Object.freeze({ cc0: "CC0", pdm: "Public Domain Mark", by: "CC BY", "by-sa": "CC BY-SA" });

function aspectParam(o) {
  if (o === "portrait") return "tall";
  if (o === "landscape") return "wide";
  if (o === "square") return "square";
  return null;
}

function licenseAllowed(code, allowed = DEFAULT_LICENSES) {
  const c = String(code || "").toLowerCase().trim();
  if (!c || /(^|-)(nc|nd)(-|$)/.test(c)) return false;
  const safe = new Set(COMMERCIAL_SAFE);
  return safe.has(c) && (Array.isArray(allowed) ? allowed.map((x) => String(x).toLowerCase()) : DEFAULT_LICENSES).includes(c);
}

function buildRequest({ query, orientation = null, perPage = 20, page = 1, licenses = DEFAULT_LICENSES, category = "photograph" } = {}) {
  const u = new URL("https://api.openverse.org/v1/images/");
  u.searchParams.set("q", String(query || "").slice(0, 200));
  u.searchParams.set("page_size", String(H.clampInt(perPage, 1, 20, 20)));
  u.searchParams.set("page", String(H.clampInt(page, 1, 50, 1)));
  const lic = (Array.isArray(licenses) ? licenses : DEFAULT_LICENSES).map((l) => String(l).toLowerCase()).filter((l) => licenseAllowed(l, COMMERCIAL_SAFE));
  u.searchParams.set("license", (lic.length ? lic : DEFAULT_LICENSES).join(","));
  if (category) u.searchParams.set("category", String(category));
  u.searchParams.set("mature", "false");
  // Measured live 2026-09-14: `category=photograph` + `aspect_ratio=tall` returned result_count 0 for a query
  // each filter alone answered with 240 hits. With a category, orientation is left to the caller's
  // cover-loss ranking instead of a filter that silently empties the page.
  const a = aspectParam(orientation);
  if (a && !category) u.searchParams.set("aspect_ratio", a);
  return { url: u.toString(), headers: {} };
}

function mapImage(r, { rank = null, licenses = DEFAULT_LICENSES } = {}) {
  if (!r || typeof r.id !== "string" || !r.id) return { item: null, why: "malformed" };
  if (r.mature === true) return { item: null, why: "mature" };
  const code = String(r.license || "").toLowerCase().trim();
  if (!licenseAllowed(code, licenses)) return { item: null, why: "license" };
  const url = H.httpsUrl(r.url);
  if (!url) return { item: null, why: "malformed" };
  const W = H.num(r.width), Hh = H.num(r.height);
  const version = typeof r.license_version === "string" && /^[0-9.]{1,6}$/.test(r.license_version) ? r.license_version : null;
  const licenseName = `${LICENSE_NAMES[code]}${version ? ` ${version}` : ""}`;
  const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 200) : null;
  const creator = typeof r.creator === "string" && r.creator.trim() ? r.creator.trim().slice(0, 120) : null;
  const thumb = H.httpsUrl(r.thumbnail);
  const renditions = [
    thumb ? { quality: "thumbnail", width: null, height: null, fps: null, fileType: "image/jpeg", url: thumb, sizeBytes: null } : null,
    { quality: "original", width: W, height: Hh, fps: null, fileType: H.fileTypeFromUrl(`x.${String(r.filetype || "jpg").toLowerCase()}`, H.fileTypeFromUrl(url)), url, sizeBytes: H.num(r.filesize) },
  ].filter(Boolean);
  const tags = (Array.isArray(r.tags) ? r.tags : [])
    .map((t) => (t && typeof t.name === "string" ? t.name.trim().toLowerCase() : null)).filter(Boolean).slice(0, 30);
  const attributionRequired = code === "by" || code === "by-sa";
  const attribution = typeof r.attribution === "string" && r.attribution.trim()
    ? r.attribution.trim().slice(0, 500)
    : `${title ? `"${title}"` : "This image"}${creator ? ` by ${creator}` : ""} is ${code === "cc0" || code === "pdm" ? "marked with" : "licensed under"} ${licenseName}.`;
  return {
    item: {
      provider: name, providerId: r.id, key: `${name}:${r.id}`, type: "image",
      title, alt: null, tags,
      text: "", // title and tags are scored as their own fields; repeating them here double-counted every word
      width: W, height: Hh, durationSec: null, fps: null,
      renditions,
      thumbnail: thumb || url,
      pictures: [], thumbs: [thumb || url], strip: null, previewUrl: null,
      pageUrl: H.httpsUrl(r.foreign_landing_url), author: { name: creator, url: H.httpsUrl(r.creator_url) },
      license: licenseName, licenseCode: code, licenseUrl: H.httpsUrl(r.license_url), attributionRequired,
      shareAlike: code === "by-sa", clearance: code === "pdm" ? "label" : "license",
      attribution,
      source: typeof r.source === "string" ? r.source.slice(0, 40) : (typeof r.provider === "string" ? r.provider.slice(0, 40) : null),
      avgColor: null, rank,
    },
    why: null,
  };
}

async function search({
  query, orientation = null, perPage = 20, page = 1, signal = null, fetch = null, timeoutMs = 15000,
  licenses = DEFAULT_LICENSES, category = "photograph", kind = "image",
} = {}) {
  if (kind !== "image") return { items: [], rateLimit: null, total: 0, rejected: { license: 0, mature: 0, malformed: 0 } };
  const req = buildRequest({ query, orientation, perPage, page, licenses, category });
  const { json, rateLimit } = await H.getJson({ provider: name, url: req.url, headers: req.headers, fetch, signal, timeoutMs, resetMode: "delta" });
  const per = H.clampInt(perPage, 1, 20, 20);
  const base = (H.clampInt(page, 1, 50, 1) - 1) * per;
  const rejected = { license: 0, mature: 0, malformed: 0 };
  const items = [];
  (Array.isArray(json.results) ? json.results : []).forEach((r, i) => {
    const { item, why } = mapImage(r, { rank: base + i + 1, licenses });
    if (item) items.push(item); else rejected[why] = (rejected[why] || 0) + 1;
  });
  return { items, rateLimit, total: H.num(json.result_count), rejected };
}

module.exports = { name, kinds, needsKey: false, search, buildRequest, mapImage, licenseAllowed, aspectParam, COMMERCIAL_SAFE, DEFAULT_LICENSES };
