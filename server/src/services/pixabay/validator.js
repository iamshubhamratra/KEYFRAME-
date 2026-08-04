// The quality floor. Runs BEFORE ranking, because ranking answers "which of these is best"
// and validation answers "is this fit to appear at all" — a 300px thumbnail can still be the
// best of a bad set, and ranking alone would happily return it.
//
// Every rejection carries a REASON. Silent filtering is what makes an empty result set
// impossible to diagnose: "pixabay returned nothing" and "pixabay returned twelve things and
// we discarded all of them" demand completely different fixes.

const { minImageWidth, minImageHeight, minVideoWidth } = require("./config");

/** @typedef {import('./types').Asset} Asset */

const HTTP_URL = /^https?:\/\/.+/i;

/**
 * @param {Asset} a
 * @param {{minWidth?:number, minHeight?:number, orientation?:string}} [opts]
 * @returns {{ok: boolean, reason: string|null}}
 */
function validate(a, opts = {}) {
  if (!a || !a.url || !HTTP_URL.test(a.url)) return { ok: false, reason: "missing or non-http url" };
  if (!a.id) return { ok: false, reason: "no provider id" };

  if (a.type === "image" || a.type === "video") {
    const minW = Number(opts.minWidth) || (a.type === "video" ? minVideoWidth() : minImageWidth());
    const minH = Number(opts.minHeight) || (a.type === "video" ? 0 : minImageHeight());
    // Unknown dimensions are NOT a rejection: Pixabay omits them on some renditions, and
    // discarding an asset for a missing field would throw away usable media. Ranking simply
    // cannot reward it.
    if (a.width != null && a.width < minW) return { ok: false, reason: `width ${a.width} < ${minW}` };
    if (minH && a.height != null && a.height < minH) return { ok: false, reason: `height ${a.height} < ${minH}` };

    if (opts.orientation && opts.orientation !== "all" && a.width && a.height) {
      const isPortrait = a.height > a.width;
      const want = opts.orientation === "vertical";
      // A near-square asset satisfies either request; only a decisive mismatch is rejected,
      // because cropping a 4:5 into 9:16 is routine and cropping a 16:9 into 9:16 is not.
      const ratio = a.width / a.height;
      const decisive = ratio > 1.25 || ratio < 0.8;
      if (decisive && isPortrait !== want) {
        return { ok: false, reason: `orientation ${isPortrait ? "portrait" : "landscape"} ≠ ${opts.orientation}` };
      }
    }
  }

  if ((a.type === "music" || a.type === "sfx") && a.duration != null) {
    if (a.type === "sfx" && a.duration > 30) return { ok: false, reason: `sfx ${a.duration}s is a bed, not a cue` };
    if (a.type === "music" && a.duration < 8) return { ok: false, reason: `music ${a.duration}s too short to bed` };
  }

  if (!a.tags.length && !a.title) return { ok: false, reason: "no metadata (untaggable, unrankable)" };
  return { ok: true, reason: null };
}

/**
 * Partition a list, keeping the rejections addressable.
 * @param {Asset[]} assets
 * @returns {{kept: Asset[], rejected: Array<{id:string, reason:string}>}}
 */
function partition(assets, opts = {}) {
  const kept = [], rejected = [];
  for (const a of assets || []) {
    const v = validate(a, opts);
    if (v.ok) kept.push(a); else rejected.push({ id: a?.id || "?", reason: v.reason });
  }
  return { kept, rejected };
}

module.exports = { validate, partition };
