// VIDEO EDIT B-ROLL ACQUIRE — download the chosen stock asset into the project, proven to be what it claims.
//
// WHY THIS EXISTS. Scoring only ever looked at thumbnails. The file that ends up in the render is a
// different download from a provider CDN: it can be an HTML error page served as video/mp4, a truncated
// body, a 4K master that blows the disk budget, or a still that is really a 1-pixel placeholder. ffmpeg
// will happily try to decode any of those in PREPARING_RENDER, minutes later, with a useless error. So
// materialization (BUILDING_EDIT_PLAN for accepted items, the replace op for user picks) goes through one
// gate (ANALYSIS.md §8 "Materialize"):
//   1. rendition = the smallest one whose short edge covers the export profile (preview540 / export720 /
//      export1080), never above 1080 short edge when a smaller one fits; otherwise the largest ≤ cap;
//   2. streaming download through broll/safe_fetch (https, public addresses only, pinned DNS, ≤ 3
//      re-validated redirects) with a byte cap, a timeout, a content-type allow-list, into a
//      `.part` file inside `assets/broll/` (same volume → atomic rename);
//   3. videos: container magic via media/probe_strict.sniffContainer (mp4/mov/mkv/webm only), strict
//      ffprobe with a FORCED demuxer and `-protocol_whitelist file`, a video stream with an allowed codec,
//      ≥ 1 s, ≥ 240 px short edge, and a real 0.5 s decode from the middle (stock clips often have no audio,
//      so probe_strict.decodeSamples, which maps audio, is not used);
//      stills: image magic (jpeg/png/webp), header dimensions (≤ 8192 px, ≤ 40 MP — decompression bombs), a
//      real decode (ffmpeg -max_pixels) + grayscale stdev (dhash.js) rejecting near-flat placeholders;
//   4. `assets/broll/<assetId>.<ext>` + sidecar `<assetId>.json` {sha1, bytes, rendition, probe}; a later
//      call with an intact file is a no-op (reused:true) — replace, retry and resume never re-download.
// Nothing about the URL, file name or path is logged or put in a user-facing error field.
//
// CONTRACT:
//   acquireChosen({ projectDir, assetRef, output?:{width,height}, profile?:'preview540'|'export720'|'export1080',
//                   signal?, fetch?, lookup?, renditions?, settings?, pidFile?, maxBytes?, timeoutMs?, decode?=true, stage? })
//     -> { assetRef:AssetRef (path 'assets/broll/<assetId>.<ext>', probed width/height/durationSec), sha1, bytes,
//          rendition:{quality,width,height}, downloadMs, reused }
//     throws EditError BROLL_ASSET_UNAVAILABLE (provider, 404: no rendition) · BROLL_DOWNLOAD_FAILED (transient:
//       network | timeout | http_5xx | http_408 | http_429) · BROLL_ASSET_REJECTED (provider, 422: bad_url |
//       http_4xx | content_type | too_large | magic | probe | no_video_stream | codec | resolution | duration |
//       undecodable | dimensions | low_information) · CANCELLED · BROLL_ACQUIRE_BAD_REQUEST (bug)
//   chooseRendition(renditions, { type, targetShort, maxShort }) -> rendition | null
//   findRenditions(projectDir, assetRef) -> renditions[]   (broll/candidates details, then analysis/broll_raw items)
//   targetShortEdge({ profile, output, type }) -> px · ACQUIRE_DEFAULTS · ASSETS_REL

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const fsx = require("../fsx");
const proc = require("../engine/proc");
const probeStrict = require("../media/probe_strict");
const { EditError, isEditError } = require("../errors");
const { sniffImage, hashImages, imageDims } = require("./dhash");
const { isPlain, num, normalizeCandidate } = require("./common");
const { safeFetch } = require("./safe_fetch");

const MB = 1024 * 1024;
const ASSETS_REL = "assets/broll";
const ACQUIRE_DEFAULTS = Object.freeze({
  profileShortEdge: Object.freeze({ preview540: 540, export720: 720, export1080: 1080 }),
  maxShortEdge: 1080,
  imageHeadroom: 1.08,       // Ken Burns zoom needs pixels beyond the box
  imageMaxShortEdge: 2160,
  videoMaxBytes: 80 * MB,
  imageMaxBytes: 20 * MB,
  timeoutMs: 120 * 1000,
  minVideoSec: 1,
  minShortEdge: 240,
  minImageLongEdge: 480,
  maxImageEdge: 8192,
  maxImagePixels: 40 * 1000 * 1000,
  maxImageAspect: 4,
  greyMinStdev: 5,
});
const ASSET_ID_RE = /^ast_[A-Za-z0-9_-]{1,60}$/;
const STOCK = new Set(["pexels", "pixabay", "openverse"]);
const VIDEO_CTYPE = /^(video\/(mp4|quicktime|webm|x-matroska)|application\/octet-stream|binary\/octet-stream)\s*(;|$)/;
const IMAGE_CTYPE = /^image\/(jpeg|jpg|pjpeg|png|webp)\s*(;|$)/;

const httpsUrl = (v) => (typeof v === "string" && v.length <= 2048 && /^https:\/\/[^\s]+$/i.test(v) ? v : null);
const round3 = (v) => Math.round(v * 1000) / 1000;
const shortOf = (r) => Math.min(r.width, r.height);

function badRequest(detail) {
  return new EditError("BROLL_ACQUIRE_BAD_REQUEST", { status: 400, errorClass: "bug", retryable: false, detail });
}
function cancelled(stage) {
  return new EditError("CANCELLED", { status: 409, errorClass: "cancelled", stage, detail: "acquire aborted" });
}
function rejected(reason, stage) {
  return new EditError("BROLL_ASSET_REJECTED", { status: 422, errorClass: "provider", retryable: false, stage, detail: reason, extra: { reason } });
}
function failed(reason, stage) {
  return new EditError("BROLL_DOWNLOAD_FAILED", { status: 503, errorClass: "transient", retryable: true, stage, detail: reason, extra: { reason } });
}
const isCancel = (e, signal) => (signal && signal.aborted) || (isEditError(e) && (e.errorClass === "cancelled" || e.code === "PROC_ABORTED"));

// ---- rendition choice ------------------------------------------------------------------------------
function targetShortEdge({ profile = "export1080", output = null, type = "video" } = {}) {
  let t = ACQUIRE_DEFAULTS.profileShortEdge[profile] || ACQUIRE_DEFAULTS.profileShortEdge.export1080;
  const ow = num(output && output.width), oh = num(output && output.height);
  if (ow > 0 && oh > 0) t = Math.min(t, Math.min(ow, oh));
  return type === "image" ? Math.round(t * ACQUIRE_DEFAULTS.imageHeadroom) : t;
}

// Smallest rendition whose short edge covers the target (so a 1080 export takes the 1080p file, never the 4K
// master, whenever a 1080p one exists); when none covers it, the largest one. Unknown sizes: the provider's last.
function chooseRendition(renditions, { targetShort = 1080 } = {}) {
  const list = (Array.isArray(renditions) ? renditions : [])
    .filter(isPlain)
    .map((r) => ({
      quality: typeof r.quality === "string" ? r.quality.slice(0, 20) : null,
      width: Math.max(0, Math.round(num(r.width) || 0)), height: Math.max(0, Math.round(num(r.height) || 0)),
      link: httpsUrl(r.link || r.url),
    }))
    .filter((r) => r.link);
  if (!list.length) return null;
  const known = list.filter((r) => r.width > 0 && r.height > 0);
  if (!known.length) return list[list.length - 1]; // providers list small → large
  const enough = known.filter((r) => shortOf(r) >= targetShort)
    .sort((a, b) => (shortOf(a) - shortOf(b)) || (a.width * a.height - b.width * b.height));
  if (enough.length) return enough[0];
  return [...known].sort((a, b) => (shortOf(b) - shortOf(a)) || (b.width * b.height - a.width * a.height))[0];
}

function listJson(dir) {
  try { return fs.readdirSync(dir).filter((f) => /\.json$/i.test(f)).sort(); } catch { return []; }
}

function findRenditions(projectDir, assetRef) {
  const id = assetRef && assetRef.assetId;
  const candDir = fsx.resolveInside(projectDir, "broll/candidates");
  for (const f of listJson(candDir)) {
    const r = fsx.readJsonSafe(path.join(candDir, f));
    const det = r.ok && isPlain(r.value) && isPlain(r.value.details) ? r.value.details[id] : null;
    if (isPlain(det) && Array.isArray(det.renditions) && det.renditions.length) return det.renditions;
  }
  const rawDir = fsx.resolveInside(projectDir, "analysis/broll_raw");
  const key = `${assetRef.provider}:${assetRef.providerId}`;
  for (const f of listJson(rawDir)) {
    const r = fsx.readJsonSafe(path.join(rawDir, f));
    const items = r.ok && isPlain(r.value) && Array.isArray(r.value.items) ? r.value.items : [];
    for (const it of items) {
      if (!isPlain(it) || `${it.provider}:${it.providerId}` !== key) continue;
      const c = normalizeCandidate(it, 0);
      if (c && c.renditions.length) return c.renditions;
    }
  }
  return [];
}

// ---- download ----------------------------------------------------------------------------------------
async function downloadTo(url, file, { fetchImpl, lookup, signal, maxBytes, timeoutMs, type, stage }) {
  if (!httpsUrl(url)) throw rejected("bad_url", stage);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("download timeout")), Math.max(1, timeoutMs));
  if (typeof timer.unref === "function") timer.unref();
  const sig = signal ? AbortSignal.any([signal, ac.signal]) : ac.signal;
  const lost = () => {
    if (signal && signal.aborted) return cancelled(stage);
    return failed(ac.signal.aborted ? "timeout" : "network", stage);
  };
  let fh = null;
  try {
    let res;
    try {
      res = await safeFetch(url, {
        fetch: fetchImpl, lookup, signal: sig,
        headers: { Accept: type === "video" ? "video/mp4,video/*;q=0.9" : "image/jpeg,image/png,image/webp" },
      });
    } catch (e) {
      if (isEditError(e) && e.code === "BROLL_URL_BLOCKED") throw rejected(e.extra && e.extra.reason === "bad_url" ? "bad_url" : "blocked", stage);
      throw lost();
    }
    const drop = () => { try { if (res.body && typeof res.body.cancel === "function") res.body.cancel().catch(() => {}); } catch { /* noop */ } };
    if (!res || !res.ok) {
      const status = res ? Number(res.status) || 0 : 0;
      if (res) drop();
      if (status >= 500 || status === 408 || status === 429 || status === 0) throw failed(`http_${status}`, stage);
      throw rejected(`http_${status}`, stage);
    }
    const headers = res.headers && typeof res.headers.get === "function" ? res.headers : { get: () => null };
    const ctype = String(headers.get("content-type") || "").toLowerCase().trim();
    if (ctype && !(type === "video" ? VIDEO_CTYPE : IMAGE_CTYPE).test(ctype)) { drop(); throw rejected("content_type", stage); }
    const len = num(headers.get("content-length"));
    if (len != null && len > maxBytes) { drop(); throw rejected("too_large", stage); }

    fh = await fs.promises.open(file, "w");
    let total = 0;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      for (;;) {
        let chunk;
        try { chunk = await reader.read(); } catch { throw lost(); }
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > maxBytes) { try { await reader.cancel(); } catch { /* noop */ } throw rejected("too_large", stage); }
        await fh.write(Buffer.from(chunk.value.buffer, chunk.value.byteOffset, chunk.value.byteLength));
      }
    } else {
      let ab;
      try { ab = await res.arrayBuffer(); } catch { throw lost(); }
      if (ab.byteLength > maxBytes) throw rejected("too_large", stage);
      total = ab.byteLength;
      await fh.write(Buffer.from(ab));
    }
    if (total === 0) throw rejected("magic", stage);
    return { bytes: total };
  } finally {
    clearTimeout(timer);
    if (fh) { try { await fh.close(); } catch { /* noop */ } }
  }
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha1");
    fs.createReadStream(file).on("data", (d) => h.update(d)).on("error", reject).on("end", () => resolve(h.digest("hex")));
  });
}

// ---- validation ------------------------------------------------------------------------------------
async function validateVideo(file, { signal, settings, pidFile, decode, stage }) {
  let demuxer;
  try { demuxer = await probeStrict.sniffContainer(file); } catch { throw rejected("magic", stage); }
  let info;
  try {
    info = await probeStrict.probeStrict(file, { demuxer, signal, settings, timeoutMs: 20000 });
  } catch (e) {
    if (isCancel(e, signal)) throw cancelled(stage);
    throw rejected("probe", stage);
  }
  const v = info.video;
  if (!v) throw rejected("no_video_stream", stage);
  if (!probeStrict.VIDEO_CODECS.has(v.codec)) throw rejected("codec", stage);
  const w = num(v.displayWidth) || num(v.width), h = num(v.displayHeight) || num(v.height);
  if (!(w > 0 && h > 0) || Math.min(w, h) < ACQUIRE_DEFAULTS.minShortEdge) throw rejected("resolution", stage);
  const dur = num(info.durationSec);
  if (!(dur >= ACQUIRE_DEFAULTS.minVideoSec)) throw rejected("duration", stage);
  if (decode) {
    const at = Math.max(0, Math.min(dur / 2, dur - 0.6));
    try {
      await proc.ffmpeg([
        "-v", "error", "-xerror", "-protocol_whitelist", "file", "-f", demuxer, "-ss", at.toFixed(3), "-i", `file:${path.resolve(file)}`,
        "-t", "0.5", "-map", "0:v:0", "-f", "null", "-",
      ], { timeoutMs: 30000, signal, label: "broll-decode", lowPriority: true, pidFile });
    } catch (e) {
      if (isCancel(e, signal)) throw cancelled(stage);
      throw rejected("undecodable", stage);
    }
  }
  const family = String(info.formatName || "");
  const ext = demuxer === "mov" ? "mp4" : (family.includes("webm") && /^(vp8|vp9|av1)$/.test(v.codec) ? "webm" : "mkv");
  return { ext, width: Math.round(w), height: Math.round(h), durationSec: round3(dur), codec: v.codec, fps: num(v.avgFps) || num(v.fps), dhash: null };
}

async function validateImage(file, { signal, pidFile, workDir, stage }) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { throw rejected("magic", stage); }
  const kind = sniffImage(buf);
  if (!kind) throw rejected("magic", stage);
  const dims = imageDims(buf);
  if (!dims || !(dims.width > 0 && dims.height > 0)) throw rejected("dimensions", stage);
  const A = ACQUIRE_DEFAULTS;
  if (Math.max(dims.width, dims.height) > A.maxImageEdge || dims.width * dims.height > A.maxImagePixels
    || dims.width / dims.height > A.maxImageAspect || dims.height / dims.width > A.maxImageAspect) throw rejected("dimensions", stage);
  if (Math.max(dims.width, dims.height) < A.minImageLongEdge) throw rejected("resolution", stage);
  fsx.ensureDir(workDir);
  let stats;
  try { [stats] = await hashImages([file], { workDir, signal, pidFile, maxPixels: A.maxImagePixels }); } catch (e) {
    if (isCancel(e, signal)) throw cancelled(stage);
    throw rejected("undecodable", stage);
  }
  if (!stats || stats.stdev == null) throw rejected("undecodable", stage);
  if (stats.stdev < A.greyMinStdev) throw rejected("low_information", stage);
  return { ext: kind === "jpeg" ? "jpg" : kind, width: dims.width, height: dims.height, durationSec: null, dhash: stats.dhash || null };
}

// ---- public ---------------------------------------------------------------------------------------
async function reuseIfIntact(projectDir, assetRef) {
  const metaAbs = fsx.resolveInside(projectDir, `${ASSETS_REL}/${assetRef.assetId}.json`);
  const r = fsx.readJsonSafe(metaAbs);
  const meta = r.ok && isPlain(r.value) ? r.value : null;
  if (!meta || typeof meta.path !== "string" || typeof meta.sha1 !== "string") return null;
  let abs;
  try { abs = fsx.resolveInside(projectDir, meta.path); } catch { return null; }
  let st;
  try { st = fs.statSync(abs); } catch { return null; }
  if (!st.isFile() || st.size !== meta.bytes) return null;
  if (await sha1File(abs) !== meta.sha1) return null;
  return meta;
}

async function acquireChosen(opts = {}) {
  const {
    projectDir, assetRef, output = null, profile = "export1080", signal = null, fetch: fetchImpl = null, lookup = null,
    renditions = null, settings = null, pidFile, decode = true, stage = null,
  } = opts;
  if (typeof projectDir !== "string" || !projectDir) throw badRequest("projectDir required");
  if (!isPlain(assetRef) || !ASSET_ID_RE.test(String(assetRef.assetId || ""))) throw badRequest("assetRef.assetId invalid");
  const type = assetRef.type === "image" ? "image" : (assetRef.type === "video" ? "video" : null);
  if (!type) throw badRequest("assetRef.type invalid");
  if (!STOCK.has(assetRef.provider)) throw badRequest("only stock assets are acquired");
  if (signal && signal.aborted) throw cancelled(stage);

  const refWith = (meta) => ({
    ...assetRef, path: meta.path, width: meta.width, height: meta.height,
    durationSec: type === "video" ? meta.durationSec : null,
    dhash: assetRef.dhash || meta.dhash || null,
  });

  const existing = await reuseIfIntact(projectDir, assetRef);
  if (existing) {
    return { assetRef: refWith(existing), sha1: existing.sha1, bytes: existing.bytes, rendition: existing.rendition, downloadMs: 0, reused: true };
  }

  const list = Array.isArray(renditions) && renditions.length ? renditions : findRenditions(projectDir, assetRef);
  const rendition = chooseRendition(list, { type, targetShort: targetShortEdge({ profile, output, type }) });
  if (!rendition) {
    throw new EditError("BROLL_ASSET_UNAVAILABLE", { status: 404, errorClass: "provider", retryable: false, stage, detail: "no downloadable rendition" });
  }

  const assetsDir = fsx.resolveInside(projectDir, ASSETS_REL);
  fsx.ensureDir(assetsDir);
  const rand = crypto.randomBytes(4).toString("hex");
  const part = path.join(assetsDir, `.${assetRef.assetId}.${rand}.part`);
  const workDir = fsx.resolveInside(projectDir, `work/acquire-${rand}`);
  const maxBytes = num(opts.maxBytes) > 0 ? num(opts.maxBytes) : (type === "video" ? ACQUIRE_DEFAULTS.videoMaxBytes : ACQUIRE_DEFAULTS.imageMaxBytes);
  const timeoutMs = num(opts.timeoutMs) > 0 ? num(opts.timeoutMs) : ACQUIRE_DEFAULTS.timeoutMs;
  const t0 = Date.now();
  try {
    const { bytes } = await downloadTo(rendition.link, part, { fetchImpl, lookup, signal, maxBytes, timeoutMs, type, stage });
    if (signal && signal.aborted) throw cancelled(stage);
    const v = type === "video"
      ? await validateVideo(part, { signal, settings, pidFile, decode, stage })
      : await validateImage(part, { signal, pidFile, workDir, stage });
    const rel = `${ASSETS_REL}/${assetRef.assetId}.${v.ext}`;
    const dest = fsx.resolveInside(projectDir, rel);
    const sha1 = await sha1File(part);
    fsx.renameWithRetrySync(part, dest);
    const meta = {
      schemaVersion: 1, assetId: assetRef.assetId, provider: assetRef.provider, providerId: assetRef.providerId, type,
      path: rel, sha1, bytes, width: v.width, height: v.height, durationSec: v.durationSec, dhash: v.dhash,
      codec: v.codec || null, fps: v.fps || null,
      rendition: { quality: rendition.quality, width: rendition.width, height: rendition.height }, profile, acquiredAt: Date.now(),
    };
    fsx.writeJsonAtomic(fsx.resolveInside(projectDir, `${ASSETS_REL}/${assetRef.assetId}.json`), meta);
    return { assetRef: refWith(meta), sha1, bytes, rendition: meta.rendition, downloadMs: Date.now() - t0, reused: false };
  } catch (e) {
    if (isCancel(e, signal)) throw cancelled(stage);
    throw e;
  } finally {
    try { fs.rmSync(part, { force: true }); } catch { /* noop */ }
    try { await fsx.rmWithRetry(workDir, { attempts: 3 }); } catch { /* temp only */ }
  }
}

module.exports = { acquireChosen, chooseRendition, findRenditions, targetShortEdge, ACQUIRE_DEFAULTS, ASSETS_REL };
