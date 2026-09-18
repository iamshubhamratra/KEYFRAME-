// VIDEO EDIT B-ROLL CONFORM — stock clips and stills turned into frame-exact, box-sized, BT.709 intermediates
// (RENDER.md §4 Stills, §5 conform; spike S1).
//
// WHY THIS EXISTS. Stock media arrives at any size, frame rate, SAR, range and matrix (JPEGs are full-range BT.601,
// phone clips 60 fps, some files anamorphic). The composite overlays each B-roll with `-itsoffset` and frame-based
// alpha fades, so the clip it reads must already be exactly the box size, 30 fps, exactly N frames, tv-range BT.709
// and tagged as such, or the fades land on the wrong frame and the colours shift (S3: ΔE2000 ≈ 5 for a matrix
// mismatch). Conforming once per (asset, geometry, span, profile) also keeps re-renders cheap: replacing one B-roll
// re-conforms only that clip. Stills get a Ken Burns move with `perspective` (sub-pixel), never zoompan, whose integer
// crop rounding wobbles 1–4 px (S1).
//
// CONTRACT:
//   conformClip(asset, { box:{w,h}, durationSec, trimInSec=0, focus:{fx,fy}={.5,.5}, profile='export1080', projectDir,
//                        runId?, signal?, rate=1, handles:{ headSec=0, tailSec=0 } })
//     -> { path (abs), relPath, key, w, h, frames, headFrames, tailFrames, totalFrames, durationSec, trimInSec,
//          trimShifted, padded, cached }
//     asset: { assetId?, path (project-relative), type?:'video'|'image' }. An image delegates to kenBurnsStill with
//     the default zoom 1→1.08. Cover-scale + crop around focus, fps 30, `setsar=1`, yuv420p tv BT.709 + colour tags,
//     no audio. Output frame k shows source time trimInSec − headSec + k·rate/30; frames [headFrames,
//     headFrames+frames) are the visible span. A span past the source end first shifts trimIn earlier, then clones
//     the last frame (padded:true). Output render/cache/conform/<key>.mp4 (+ .json); the packet count is verified.
//   kenBurnsStill(image, { box, durationSec, zoomFrom=1, zoomTo=1.08, focus, profile, projectDir, runId?, signal?,
//                          ease='linear' }) -> same shape (headFrames = tailFrames = 0)
//     crop to the box aspect around focus → pre-scale once (≤ 2× box) → loop → perspective zoom anchored on the focus
//     point → lanczos to the box.
//   conformKey(...) · cropRect({ src:{w,h}, box, focus }) · CONFORM_ENCODE
//   Throws EditError CONFORM_INVALID (input) | CONFORM_SOURCE_MISSING | CONFORM_SOURCE_UNREADABLE | CONFORM_FRAME_MISMATCH,
//   or the PROC_* errors.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const proc = require("../engine/proc");
const fsx = require("../fsx");
const { EditError } = require("../errors");
const { newRunId } = require("../ids");
const X = require("../render/exprs");

const CONFORM_VERSION = 1;
const FPS = X.FPS;
const CACHE_REL = "render/cache/conform";
// Mirrors RENDER.md §1 A-roll intermediate quality: conforms are re-encoded once more by the composite.
const CONFORM_ENCODE = Object.freeze({
  preview540: Object.freeze({ preset: "ultrafast", crf: 20 }),
  export720: Object.freeze({ preset: "ultrafast", crf: 14 }),
  export1080: Object.freeze({ preset: "ultrafast", crf: 12 }),
});
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);

const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const bad = (detail) => new EditError("CONFORM_INVALID", { status: 422, errorClass: "input", detail });

function resolveProfile(profile) {
  if (profile && typeof profile === "object") {
    const crf = Number(profile.crf), preset = String(profile.preset || "ultrafast");
    if (!Number.isFinite(crf) || crf < 0 || crf > 51 || !/^[a-z]+$/.test(preset)) throw bad("profile {preset, crf} invalid");
    return { name: String(profile.name || "custom").slice(0, 40), preset, crf };
  }
  const name = profile || "export1080";
  if (!CONFORM_ENCODE[name]) throw bad(`unknown profile '${name}'`);
  return { name, ...CONFORM_ENCODE[name] };
}

function checkBox(box) {
  if (!box || !Number.isInteger(box.w) || !Number.isInteger(box.h) || box.w < 2 || box.h < 2 || box.w % 2 || box.h % 2 || box.w > 4096 || box.h > 4096) {
    throw bad("box {w,h} must be even integers in 2..4096");
  }
  return { w: box.w, h: box.h };
}
function checkFocus(focus) {
  const fx = focus && Number.isFinite(focus.fx) ? clamp(focus.fx, 0, 1) : 0.5;
  const fy = focus && Number.isFinite(focus.fy) ? clamp(focus.fy, 0, 1) : 0.5;
  return { fx: r4(fx), fy: r4(fy) };
}
function framesOf(sec, name, { max = 600 } = {}) {
  const f = Math.round(Number(sec) * FPS + 1e-9);
  if (!Number.isFinite(f) || f < 1 || f > max * FPS) throw bad(`${name} must be 1 frame .. ${max} s`);
  return f;
}

// Cover crop in source pixels (display aspect via sar) around the focus point; integer rect, exact=1 in the filter.
function cropRect({ src, box, focus, sar = 1 }) {
  const dispW = src.w * sar, A = box.w / box.h;
  let cw, ch;
  if (dispW / src.h > A) { ch = src.h; cw = Math.min(src.w, Math.max(2, Math.round((src.h * A) / sar))); }
  else { cw = src.w; ch = Math.min(src.h, Math.max(2, Math.round(dispW / A))); }
  const x = Math.round(clamp(focus.fx * src.w - cw / 2, 0, src.w - cw));
  const y = Math.round(clamp(focus.fy * src.h - ch / 2, 0, src.h - ch));
  return { x, y, w: cw, h: ch };
}

function conformKey(parts) { return sha1(fsx.canonicalJson({ v: CONFORM_VERSION, ...parts })); }

async function probeSource(projectDir, rel, format, signal) {
  let j;
  try {
    j = await proc.ffprobeJson(["-protocol_whitelist", "file", "-f", format, "-show_streams", "-show_format", "-of", "json", `file:${rel}`],
      { cwd: projectDir, signal, timeoutMs: 30000, label: "conform-probe" });
  } catch (e) {
    if (e && e.code === "PROC_ABORTED") throw e;
    throw new EditError("CONFORM_SOURCE_UNREADABLE", { status: 422, errorClass: "input", detail: e && e.detail ? e.detail : "probe failed" });
  }
  const v = (j.streams || []).find((s) => s && s.codec_type === "video");
  if (!v || !(v.width > 0) || !(v.height > 0)) throw new EditError("CONFORM_SOURCE_UNREADABLE", { status: 422, errorClass: "input", detail: "no video stream" });
  let rotation = 0;
  for (const sd of v.side_data_list || []) if (Number.isFinite(Number(sd.rotation))) rotation = Number(sd.rotation);
  const quarter = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const m = /^(\d+):(\d+)$/.exec(String(v.sample_aspect_ratio || ""));
  let sar = m && Number(m[1]) > 0 && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 1;
  const w = quarter ? v.height : v.width, h = quarter ? v.width : v.height;
  if (quarter && sar !== 1) sar = 1 / sar;
  const dur = Number(v.duration) > 0 ? Number(v.duration) : Number(j.format && j.format.duration);
  return { w, h, sar, durationSec: Number.isFinite(dur) && dur > 0 ? dur : null };
}

function encodeArgs(prof) {
  return ["-an", "-sn", "-dn", "-map_metadata", "-1", "-c:v", "libx264", "-preset", prof.preset, "-crf", String(prof.crf),
    "-pix_fmt", "yuv420p", ...X.COLOR_ARGS, "-r", String(FPS), "-video_track_timescale", "30000", "-bf", "0", "-g", "60",
    "-threads", "3", "-movflags", "+faststart", "-f", "mp4"];
}

function paths(projectDir, key) {
  const dir = fsx.ensureDir(fsx.resolveInside(projectDir, CACHE_REL));
  return { dir, relPath: `${CACHE_REL}/${key}.mp4`, abs: path.join(dir, `${key}.mp4`), meta: path.join(dir, `${key}.json`), fcsRel: `${CACHE_REL}/${key}.fcs` };
}

function cachedResult(p, key) {
  const m = fsx.readJsonSafe(p.meta);
  if (!m.ok || !m.value || m.value.version !== CONFORM_VERSION || !fs.existsSync(p.abs)) return null;
  return { ...m.value.result, path: p.abs, relPath: p.relPath, key, cached: true };
}

async function countPackets(projectDir, rel, signal) {
  const j = await proc.ffprobeJson(["-protocol_whitelist", "file", "-f", "mov", "-count_packets", "-select_streams", "v:0",
    "-show_entries", "stream=nb_read_packets,width,height", "-of", "json", `file:${rel}`], { cwd: projectDir, signal, timeoutMs: 30000, label: "conform-verify" });
  const s = (j.streams || [])[0] || {};
  return { packets: Number(s.nb_read_packets), w: s.width, h: s.height };
}

async function encode({ projectDir, p, key, graph, input, expected, signal, runId, result, timeoutMs }) {
  const rid = runId || newRunId();
  const tmpRel = `${p.relPath}.tmp.${rid}.mp4`;
  fs.writeFileSync(path.join(p.dir, `${key}.fcs`), graph);
  try {
    await proc.ffmpeg(["-y", ...X.inputArgs(input), "-/filter_complex", p.fcsRel, "-map", "[v]", ...encodeArgs(expected.prof), tmpRel],
      { cwd: projectDir, signal, timeoutMs, label: "conform", stage: "RENDERING" });
    const v = await countPackets(projectDir, tmpRel, signal);
    if (v.packets !== expected.totalFrames || v.w !== expected.w || v.h !== expected.h) {
      throw new EditError("CONFORM_FRAME_MISMATCH", { errorClass: "bug", detail: `got ${v.packets} frames ${v.w}x${v.h}, want ${expected.totalFrames} ${expected.w}x${expected.h}` });
    }
    fsx.renameWithRetrySync(path.join(projectDir, tmpRel), p.abs);
    fsx.writeJsonAtomic(p.meta, { version: CONFORM_VERSION, key, result });
    return { ...result, path: p.abs, relPath: p.relPath, key, cached: false };
  } finally {
    try { fs.unlinkSync(path.join(projectDir, tmpRel)); } catch { /* renamed or absent */ }
  }
}

function sourceOf(asset, projectDir) {
  if (typeof projectDir !== "string" || !path.isAbsolute(projectDir)) throw bad("projectDir must be absolute");
  const rel = typeof asset === "string" ? asset : asset && asset.path;
  if (typeof rel !== "string" || !rel) throw bad("asset.path required");
  const abs = fsx.resolveInside(projectDir, rel);
  if (!fs.existsSync(abs)) throw new EditError("CONFORM_SOURCE_MISSING", { status: 409, errorClass: "input", detail: rel });
  return { rel: rel.split(path.sep).join("/"), abs, assetId: asset && typeof asset === "object" ? asset.assetId || null : null };
}

async function conformClip(asset, opts = {}) {
  const { durationSec, trimInSec = 0, profile, projectDir, runId, signal, rate = 1, handles = {} } = opts;
  const src = sourceOf(asset, projectDir);
  const isImage = (asset && asset.type === "image") || IMAGE_EXT.has(path.extname(src.rel).toLowerCase());
  if (isImage) return kenBurnsStill(asset, { ...opts, zoomFrom: opts.zoomFrom ?? 1, zoomTo: opts.zoomTo ?? 1.08 });

  const box = checkBox(opts.box), focus = checkFocus(opts.focus), prof = resolveProfile(profile);
  const frames = framesOf(durationSec, "durationSec");
  const R = Number(rate);
  if (!(R >= 0.25 && R <= 4)) throw bad("rate must be in [0.25, 4]");
  const format = X.inputFormatFor(src.rel) || "mov";
  let headF = Math.max(0, Math.round(Number(handles.headSec || 0) * FPS));
  const tailF = Math.max(0, Math.round(Number(handles.tailSec || 0) * FPS));
  let trimIn = Math.max(0, Math.round(Number(trimInSec) * FPS) / FPS);
  if (!Number.isFinite(trimIn)) throw bad("trimInSec invalid");

  const info = await probeSource(projectDir, src.rel, format, signal);
  // Source seconds consumed by the visible span; shift trimIn back rather than freeze the end of a short clip.
  const spanS = (frames * R) / FPS;
  let trimShifted = false;
  if (info.durationSec != null && trimIn + spanS > info.durationSec - 1e-6) {
    const shifted = Math.max(0, Math.floor((info.durationSec - spanS) * FPS) / FPS);
    if (shifted !== trimIn) { trimIn = shifted; trimShifted = true; }
  }
  headF = Math.min(headF, Math.floor((trimIn * FPS) / R + 1e-9));
  const totalF = headF + frames + tailF;
  const seekS = Math.max(0, trimIn - (headF * R) / FPS);
  const padded = info.durationSec != null && seekS + (totalF * R) / FPS > info.durationSec + 1 / FPS;
  const crop = cropRect({ src: info, box, focus, sar: info.sar });

  const fileSha = await fsx.partialSha(src.abs);
  const key = conformKey({ kind: "clip", assetId: src.assetId, fileSha, box, frames, headF, tailF, seekF: Math.round(seekS * FPS * 1000), rate: R, crop, profile: prof });
  const p = paths(projectDir, key);
  const hit = cachedResult(p, key);
  if (hit) return hit;

  const chain = [
    "setpts=PTS-STARTPTS",
    ...(R !== 1 ? [`setpts=PTS/${R}`] : []),
    `fps=${FPS}`,
    `tpad=stop_mode=clone:stop=${totalF}`,
    `trim=end_frame=${totalF}`,
    "setpts=PTS-STARTPTS",
    `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}:exact=1`,
    `scale=${box.w}:${box.h}:flags=lanczos:out_color_matrix=bt709:out_range=tv`,
    "setsar=1", "format=yuv420p", X.COLOR_TAG_FILTER,
  ].join(",");
  const result = {
    w: box.w, h: box.h, frames, headFrames: headF, tailFrames: tailF, totalFrames: totalF, durationSec: frames / FPS,
    trimInSec: r4(trimIn), trimShifted, padded, crop,
  };
  return encode({
    projectDir, p, key, graph: `[0:v]${chain}[v]\n`, signal, runId, result,
    input: { path: src.rel, format, options: seekS > 0 ? ["-ss", X.fmt6(seekS)] : [] },
    expected: { prof, totalFrames: totalF, w: box.w, h: box.h },
    timeoutMs: Math.max(60000, Math.round((totalF / FPS) * 20000 * Math.max(1, (box.w * box.h) / 2.07e6))),
  });
}

async function kenBurnsStill(image, opts = {}) {
  const { durationSec, zoomFrom = 1, zoomTo = 1.08, profile, projectDir, runId, signal, ease = "linear" } = opts;
  const src = sourceOf(image, projectDir);
  const box = checkBox(opts.box), focus = checkFocus(opts.focus), prof = resolveProfile(profile);
  const frames = framesOf(durationSec, "durationSec", { max: 60 });
  const z0 = Number(zoomFrom), z1 = Number(zoomTo);
  if (!(z0 >= 1 && z0 <= 2 && z1 >= 1 && z1 <= 2)) throw bad("zoomFrom/zoomTo must be in [1, 2]");
  if (ease !== "linear" && ease !== "smoothstep") throw bad("ease must be linear|smoothstep");

  const info = await probeSource(projectDir, src.rel, "image2", signal);
  const crop = cropRect({ src: info, box, focus, sar: info.sar });
  // Work size: perspective runs on up to 2× the box so the zoom keeps detail; the final lanczos lands on the box.
  const k = clamp(Math.floor((crop.w / box.w) * 2) / 2, 1, 2);
  const work = { w: X.evenRound(box.w * k), h: X.evenRound(box.h * k) };
  // The focus point's position inside the crop is the zoom's fixed point.
  const anchor = { fx: r4(clamp((focus.fx * info.w - crop.x) / crop.w, 0, 1)), fy: r4(clamp((focus.fy * info.h - crop.y) / crop.h, 0, 1)) };
  const animated = frames >= 2 && Math.abs(z1 - z0) > 1e-6;
  const still = !animated && z0 > 1 + 1e-6;

  const fileSha = await fsx.partialSha(src.abs);
  const key = conformKey({ kind: "still", assetId: src.assetId, fileSha, box, frames, crop, work, z0, z1, ease, anchor, profile: prof });
  const p = paths(projectDir, key);
  const hit = cachedResult(p, key);
  if (hit) return hit;

  const parts = [
    `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}:exact=1`,
    `scale=${work.w}:${work.h}:flags=lanczos:out_color_matrix=bt709:out_range=tv`,
    "setsar=1", "format=yuv420p",
    `loop=loop=${frames - 1}:size=1:start=0`, `settb=1/${FPS}`, "setpts=N",
  ];
  if (animated) parts.push(X.perspectiveZoomFilter({ z0, z1, frames, ease, anchor }));
  else if (still) parts.push(X.perspectiveZoomFilter({ z0, z1: z0 + 1e-6, frames: 2, anchor }));
  if (work.w !== box.w || work.h !== box.h) parts.push(`scale=${box.w}:${box.h}:flags=lanczos`);
  parts.push("setsar=1", "format=yuv420p", X.COLOR_TAG_FILTER);

  const result = {
    w: box.w, h: box.h, frames, headFrames: 0, tailFrames: 0, totalFrames: frames, durationSec: frames / FPS,
    trimInSec: 0, trimShifted: false, padded: false, crop, work, anchor, zoomFrom: z0, zoomTo: z1,
  };
  return encode({
    projectDir, p, key, graph: `[0:v]${parts.join(",")}[v]\n`, signal, runId, result,
    input: { path: src.rel, format: "image2", options: [] },
    expected: { prof, totalFrames: frames, w: box.w, h: box.h },
    timeoutMs: Math.max(60000, Math.round((frames / FPS) * 30000 * Math.max(1, (work.w * work.h) / 2.07e6))),
  });
}

module.exports = { conformClip, kenBurnsStill, conformKey, cropRect, CONFORM_ENCODE, CONFORM_VERSION };
