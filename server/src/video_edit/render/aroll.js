// VIDEO EDIT A-ROLL RENDERER — composition chunks -> frame-exact H.264 chunks -> concatenated base (RENDER.md §3).
//
// WHY THIS EXISTS. The speaker's footage is the spine of every edit, and it is the expensive part: every cut,
// framing change and punch-in re-encodes pixels. Rendering it as ~8 s chunks keyed by what they contain means an
// edit re-encodes only the chunks it touched, and the concat demuxer stitches the rest with `-c copy`. That only
// works if every chunk is frame-exact and bit-compatible with its neighbours: identical codec params, time base and
// pix_fmt, an IDR at frame 0, seek/trim values derived from frame indices with six decimals (spike S2 lost frames with
// three), and never an animated crop w/h (S1). Holds (FREEZE) clone one frame; speed pieces retime then pin their
// frame count; SPLIT sub-pieces stack the face crop with a conformed B-roll half.
//
// CONTRACT:
//   renderChunk({ comp, chunk, projectDir, mezzRel, runId, signal, pidFile, threads=3, conformSplit, onProgress, fault })
//     fault: { point:"render", settings, project, chunk } — VIDEO_EDIT_FAULTS render:{exit1|hang|chunk:<n>} (faults.js)
//     -> Promise<{ path, relPath, key, cached, frames }>
//     conformSplit(source, box, profileName) -> Promise<{ path (abs), headFrames }> — the SPLIT B-roll conform (cached).
//   renderBase({ comp, projectDir, mezzRel, runId, signal, pidFile, threads, conformSplit, onChunk(i, n, cached) })
//     -> Promise<{ path, relPath, key, cached, chunks:{ total, cacheHits } }>
//   chunkFilterScript(comp, chunk, { splitInputs }) -> { script, extraInputs }   (pure; exported for tests)
//   chunkSeek(chunk) -> { ssF, toF }
// Throws the PROC_* errors of engine/proc.js, or RENDER_CHUNK_FRAMES when a chunk's frame count is wrong.

const fs = require("node:fs");
const path = require("node:path");
const proc = require("../engine/proc");
const X = require("./exprs");
const P = require("./profiles");
const cache = require("./cache");
const { EditError } = require("../errors");

const FPS = 30;
const fmt6 = (x) => (Math.round(Number(x) * 1e6) / 1e6).toFixed(6);

function chunkSeek(chunk) {
  return { ssF: chunk.srcStartF, toF: chunk.srcEndF + 1 };
}

// trim bounds relative to the seek (RENDER.md §3 guarded form; S=0 uses the half-frame margin without a seek).
function trimBounds(inF, outF, S) {
  if (S === 0) return { t0: (inF - 0.5) / FPS, t1: (outF - 0.5) / FPS };
  return { t0: (inF - S) / FPS, t1: (outF - S) / FPS };
}

function framingChain(sub, out) {
  const f = sub.framing;
  if (f.mode === "static") return X.staticFramingFilter({ crop: f.crop, out });
  if (f.mode === "pan") return X.panFramingFilter({ crop: f.crop, keyframes: f.keyframes, pieceStartS: sub.srcInF / FPS, out });
  if (f.mode === "zoomAnim") return X.perspectiveZoomFilter({ crop: f.crop, z0: f.z0, z1: f.z1, frames: f.frames, out, ease: f.ease, anchor: f.anchor });
  return null;
}

function chunkFilterScript(comp, chunk, { splitInputs = {} } = {}) {
  const out = { w: comp.profile.W, h: comp.profile.H };
  const byId = new Map(comp.base.pieces.map((p) => [p.id, p]));
  const subs = chunk.pieceIds.map((id) => byId.get(id));
  const S = chunk.srcStartF;
  const lines = [];
  const labels = [];
  const extraInputs = [];
  let nextInput = 1;
  subs.forEach((s, i) => {
    const L = `p${i}`;
    const isHold = s.kind === "hold";
    const { t0, t1 } = trimBounds(s.srcInF, isHold ? s.srcInF + 1 : s.srcOutF, S);
    const head = `[0:v]trim=start=${fmt6(Math.max(0, t0))}:end=${fmt6(t1)},setpts=PTS-STARTPTS`;
    let tail = "";
    if (s.kind === "speed") {
      const sp = X.speedFilters({ rate: s.rate, srcFrames: s.srcOutF - s.srcInF });
      tail = `,${sp.video}`;
    } else if (isHold) {
      tail = s.holdF > 1 ? `,tpad=stop_mode=clone:stop=${s.holdF - 1},trim=end_frame=${s.holdF}` : ",trim=end_frame=1";
    }
    if (s.layout === "SPLIT" && s.split) {
      const si = splitInputs[s.id];
      if (!si) throw new EditError("RENDER_SPLIT_INPUT", { errorClass: "bug", detail: s.id });
      lines.push(`${head}${tail}[${L}f]`);
      const frag = X.splitStackFilter({
        faceLabel: `${L}f`, outLabel: `${L}s`, out, faceCrop: s.split.faceCrop, side: s.split.side,
        broll: { path: si.path, startFrame: si.startFrame, frames: s.outOutF - s.outInF }, inputIndex: nextInput,
      });
      lines.push(frag.graph);
      lines.push(`[${L}s]setsar=1,format=yuv420p[${L}]`);
      extraInputs.push(...frag.inputs.map((inp) => ({ ...inp, path: si.path })));
      nextInput = frag.nextInputIndex;
    } else if (s.framing.mode === "fit") {
      lines.push(`${head}${tail}[${L}a]`);
      const frag = X.blurFillFilter({ inLabel: `${L}a`, outLabel: `${L}b`, out });
      lines.push(frag.graph);
      lines.push(`[${L}b]format=yuv420p[${L}]`);
    } else {
      lines.push(`${head},${framingChain(s, out)}${tail},format=yuv420p[${L}]`);
    }
    labels.push(`[${L}]`);
  });
  const joined = labels.length > 1 ? `${labels.join("")}concat=n=${labels.length}:v=1:a=0,` : labels[0];
  lines.push(`${joined}setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[v]`);
  return { script: lines.join(";\n"), extraInputs };
}

async function countFrames(file, { signal, pidFile }) {
  const j = await proc.ffprobeJson(["-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "json", "-protocol_whitelist", "file", `file:${file}`],
    { timeoutMs: 60000, signal, pidFile, label: "ffprobe-count" });
  const s = j && Array.isArray(j.streams) && j.streams[0];
  return s ? Number(s.nb_read_packets) : NaN;
}

async function renderChunk({ comp, chunk, projectDir, mezzRel, runId, signal, pidFile, threads = 3, conformSplit, onProgress, preset = null, fault = null }) {
  const byId = new Map(comp.base.pieces.map((p) => [p.id, p]));
  const subs = chunk.pieceIds.map((id) => byId.get(id));
  return cache.getOrMake({
    projectDir, level: "aroll", key: chunk.key, ext: "mp4", runId,
    make: async (tmpAbs) => {
      const splitInputs = {};
      for (const s of subs) {
        if (s.layout !== "SPLIT" || !s.split) continue;
        if (typeof conformSplit !== "function") throw new EditError("RENDER_SPLIT_INPUT", { errorClass: "bug", detail: "conformSplit missing" });
        const c = await conformSplit(s.split.source, s.split.box, comp.profile.name);
        splitInputs[s.id] = { path: path.relative(projectDir, c.path).split(path.sep).join("/"), startFrame: (c.headFrames || 0) + s.split.offsetF };
      }
      const { script, extraInputs } = chunkFilterScript(comp, chunk, { splitInputs });
      const scriptRel = `render/cache/aroll/${chunk.key}.fcs`;
      fs.writeFileSync(path.join(projectDir, scriptRel), script);
      const { ssF, toF } = chunkSeek(chunk);
      const seekOpts = chunk.srcStartF > 0
        ? ["-ss", fmt6(Math.max(0, (ssF - 0.5) / FPS)), "-to", fmt6(toF / FPS)]
        : ["-to", fmt6(toF / FPS)];
      const enc = preset || comp.profile.inter;
      const args = [
        "-y", ...X.inputArgs({ path: mezzRel, format: "mov", options: seekOpts }),
        ...extraInputs.flatMap((inp) => X.inputArgs(inp)),
        "-/filter_complex", scriptRel, "-map", "[v]", "-an",
        "-c:v", "libx264", "-preset", enc.preset, "-crf", String(enc.crf), ...P.ENCODE_COMMON, "-g", "60",
        "-threads", String(threads), "-movflags", "+faststart", path.relative(projectDir, tmpAbs).split(path.sep).join("/"),
      ];
      await proc.ffmpeg(args, {
        cwd: projectDir, signal, pidFile, label: "aroll-chunk", stage: "RENDERING", fault,
        timeoutMs: Math.max(120000, chunk.frames * 1500), expectedDurationSec: chunk.frames / FPS,
        onProgress: typeof onProgress === "function" ? (pct) => onProgress(pct) : undefined,
      });
      const n = await countFrames(tmpAbs, { signal, pidFile });
      if (n !== chunk.frames) {
        throw new EditError("RENDER_CHUNK_FRAMES", { errorClass: "bug", retryable: true, stage: "RENDERING", detail: `chunk ${chunk.key.slice(0, 8)} has ${n} frames, expected ${chunk.frames}` });
      }
    },
  }).then((r) => ({ ...r, key: chunk.key, frames: chunk.frames }));
}

async function renderBase({ comp, projectDir, mezzRel, runId, signal, pidFile, threads = 3, conformSplit, onChunk, preset = null, fault = null }) {
  const chunks = comp.base.chunks;
  let hits = 0;
  const rels = [];
  for (let i = 0; i < chunks.length; i++) {
    const r = await renderChunk({
      comp, chunk: chunks[i], projectDir, mezzRel, runId, signal, pidFile, threads, conformSplit, preset,
      fault: fault ? { point: "render", ...fault, chunk: i } : null,
      onProgress: (pct) => { if (typeof onChunk === "function") onChunk(i, chunks.length, false, pct); },
    });
    if (r.cached) hits++;
    rels.push(r.relPath);
    if (typeof onChunk === "function") onChunk(i + 1, chunks.length, r.cached, 0);
  }
  const base = await cache.getOrMake({
    projectDir, level: "base", key: comp.base.key, ext: "mp4", runId,
    make: async (tmpAbs) => {
      // Paths in a concat list resolve relative to the list file, and `-safe 1` rejects '..' components, so the
      // list lives beside the chunks.
      const listRel = `render/cache/aroll/base-${comp.base.key}.txt`;
      const lines = rels.map((r) => `file '${path.posix.basename(r)}'`);
      fs.writeFileSync(path.join(projectDir, listRel), lines.join("\n") + "\n");
      await proc.ffmpeg([
        "-y", "-f", "concat", "-safe", "1", "-protocol_whitelist", "file", "-i", listRel, "-c", "copy", "-movflags", "+faststart",
        path.relative(projectDir, tmpAbs).split(path.sep).join("/"),
      ], { cwd: projectDir, signal, pidFile, label: "aroll-concat", stage: "RENDERING", timeoutMs: 300000 });
      const n = await countFrames(tmpAbs, { signal, pidFile });
      if (n !== comp.durationFrames) {
        throw new EditError("RENDER_CHUNK_FRAMES", { errorClass: "bug", retryable: true, stage: "RENDERING", detail: `base has ${n} frames, expected ${comp.durationFrames}` });
      }
    },
  });
  return { ...base, key: comp.base.key, chunks: { total: chunks.length, cacheHits: hits } };
}

module.exports = { renderChunk, renderBase, chunkFilterScript, chunkSeek, countFrames };
