// Shared JSDoc typedefs. No runtime code — required only so editors and `tsc --checkJs`
// can resolve `import('./types').Asset` from the other files in this module.
//
// The NORMALIZED ASSET is the whole point of the module: every provider, every asset type,
// one shape. A consumer that reads `.url`, `.width`, `.score` never learns which provider
// served it, which is what makes adding Pexels/Unsplash a file rather than a refactor.

/**
 * @typedef {"image"|"video"|"music"|"sfx"} AssetType
 */

/**
 * A provider-agnostic asset. Fields that do not apply to a type are null, never absent —
 * a caller destructuring `duration` off an image should get null, not undefined.
 *
 * @typedef {Object} Asset
 * @property {string}   id         provider-native id, stringified
 * @property {string}   provider   "pixabay" (future: "pexels", "unsplash", …)
 * @property {AssetType} type
 * @property {string}   title      best available human label; "" when the provider gives none
 * @property {string}   url        the DOWNLOADABLE url (not the landing page)
 * @property {string|null} thumbnail
 * @property {number|null} width
 * @property {number|null} height
 * @property {number|null} duration seconds; null for stills
 * @property {string[]}  tags
 * @property {number}    score     0..100, from ranking.js — comparable ACROSS types
 * @property {string|null} pageUrl provider landing page, for attribution
 * @property {string}    license
 * @property {Object}    raw       the untouched provider payload, for debugging
 */

/**
 * @typedef {Object} SearchOptions
 * @property {string[]|string} keywords    one or many; many are merged, deduped and ranked
 * @property {AssetType}   [type]
 * @property {"vertical"|"horizontal"|"all"} [orientation]
 * @property {string}      [category]
 * @property {string}      [language]
 * @property {number}      [minWidth]
 * @property {number}      [minHeight]
 * @property {boolean}     [safeSearch]
 * @property {number}      [page]
 * @property {number}      [perPage]
 * @property {number}      [limit]        how many ranked assets to RETURN (default 10)
 * @property {number}      [pick]         when set, choose N keywords at random from the list
 * @property {string}      [seed]         makes `pick` deterministic for a given job
 * @property {boolean}     [noCache]
 */

/**
 * @typedef {Object} SearchResult
 * @property {Asset[]} assets      ranked, best first
 * @property {string[]} queries    the queries actually issued
 * @property {boolean} cached      true when every query was served from cache
 * @property {number}  elapsedMs
 * @property {string|null} error   set when every query failed; assets is [] but never throws
 */

module.exports = {};
