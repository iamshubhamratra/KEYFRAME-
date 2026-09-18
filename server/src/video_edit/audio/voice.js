// VIDEO EDIT VOICE STEM — the edited speech track, sample-exact to the output timeline (RENDER.md §8).
//
// WHY THIS EXISTS. Every cut the plan keeps is a frame-exact A-roll piece; the voice under it must land
// on the same sample (frames × 1600 at 48 kHz) or lips drift a little more at every joint. Joints cut
// mid-word must not click, the cleanup chain the analysis recommended must run once over the joined
// speech (not per piece, where a highpass restarts at every joint), and the stem must arrive at a
// predictable level so `audio_mix.mix` does not fire its gain step (S7: a −16 LUFS stem lands inside
// mix()'s ±1 dB dead-band). Rebuilding it is cheap but not free, so it is cached by content key.
//
// MEASURED (ffmpeg 8.0): `afftdn` delays its output by 1200 samples (25 ms at 48 kHz) and keeps the
// sample count, so without compensation the denoised stem is 25 ms late and loses its last 25 ms.
// highpass / equalizer / dynaudnorm / deesser / alimiter(latency=1) add no delay. The afftdn delay is
// calibrated once per process with an impulse through the exact filter string and compensated
// (apad before, atrim after).
//
// CONTRACT:
//   buildVoiceStem({ projectDir, pieces:[{ srcInS, srcOutS, rate=1, padS=0, fadeMs=6 }], chain, runId?, signal?,
//                    sourceRel='work/voice48k.wav', sourceSha?, targetLufs=-16 })
//     -> { path (abs), relPath, key, samples, durationSec, lufs, truePeakDb, lraLu, gainDb, cached }
//     chain: { highpassHz=80, notchesHz=[], afftdn: {nf, nr}|null, dynaudnorm=false, deesser=false }
//     Seconds are snapped to the 30 fps grid first; every sample index is frames × 1600. A piece with
//     srcOutS == srcInS and padS > 0 is a hold (silence). rate != 1 → atempo, output length
//     max(1, round(frames / rate)) frames (plan/timeline.js). padS → apad (FREEZE at that joint).
//     Output render/cache/voice/<key>.wav (pcm_s16le 48 kHz mono) + <key>.json; key =
//     sha1(version, frame pieces, chain, source partial sha, target).
//     Throws EditError VOICE_EMPTY | VOICE_SOURCE_MISSING | VOICE_SOURCE_FORMAT, or the PROC_* errors.
//   voiceKey(...) · normalizePieces(pieces) · normalizeChain(chain) · buildVoiceFilter(pieces, chain, { afftdnDelay })
//   afftdnDelaySamples(filter, { signal }) -> Promise<int>   (memoized per filter string; fallback 1200)
//   measureEbur128(file, { signal, cwd }) -> { integratedLufs, lraLu, truePeakDbtp }   (shared with mix.js)
//   parseEbur128Summary(stderr) · parseLoudnormJson(stderr) · inputFormatFor(file) · inputArgs(file) · fmt6(x)

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const proc = require("../engine/proc");
const fsx = require("../fsx");
const { EditError } = require("../errors");
const { newRunId } = require("../ids");

const FPS = 30;
const SR = 48000;
const SPF = SR / FPS; // 1600 samples per frame
const VOICE_VERSION = 2; // 2: afftdn delay compensation
const DEFAULT_FADE_MS = 6;
const TARGET_LUFS = -16;
const GAIN_CLAMP_DB = 18;
const AFFTDN_DELAY_FALLBACK = 1200; // measured on ffmpeg 8.0 at 48 kHz
// tts.js:538 limiter, with the S7 corrections: level=disabled (the default auto-level re-normalizes peaks to
// 0 dBFS) and latency=1 (removes a 2.8 ms lag).
const STEM_LIMITER = "alimiter=limit=0.94:attack=3:release=40:level=disabled:latency=1";

const fmt6 = (x) => (Math.round(Number(x) * 1e6) / 1e6).toFixed(6);
const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");

function inputFormatFor(file) {
  const ext = path.extname(String(file)).toLowerCase();
  return { ".wav": "wav", ".mp4": "mov", ".mov": "mov", ".m4a": "mov", ".mp3": "mp3", ".webm": "matroska", ".mkv": "matroska" }[ext] || null;
}

// `-protocol_whitelist file [-f fmt] -i file:<path>` — every edit-engine input goes through this shape.
function inputArgs(file, { format } = {}) {
  const f = format === undefined ? inputFormatFor(file) : format;
  return ["-protocol_whitelist", "file", ...(f ? ["-f", f] : []), "-i", `file:${file}`];
}

function parseLoudnormJson(stderr) {
  const m = String(stderr || "").match(/\{[^{}]*"input_i"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
    return { inputI: n(j.input_i), inputTp: n(j.input_tp), inputLra: n(j.input_lra), inputThresh: n(j.input_thresh) };
  } catch { return null; }
}

function parseEbur128Summary(stderr) {
  const s = String(stderr || "");
  const at = s.lastIndexOf("Summary:");
  if (at < 0) return null;
  const sum = s.slice(at);
  const num = (re) => {
    const m = sum.match(re);
    if (!m) return null;
    if (/^-inf$/i.test(m[1])) return -Infinity;
    const x = Number(m[1]);
    return Number.isFinite(x) ? x : null;
  };
  return {
    integratedLufs: num(/I:\s+(-?[\d.]+|-inf) LUFS/),
    lraLu: num(/LRA:\s+(-?[\d.]+|-inf) LU/),
    truePeakDbtp: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/),
  };
}

async function measureEbur128(file, { signal, cwd, timeoutMs = 120000, stream = "0:a:0" } = {}) {
  const r = await proc.ffmpeg([
    "-loglevel", "info", "-nostats", ...inputArgs(file), "-map", stream, "-af", "ebur128=peak=true", "-f", "null", "-",
  ], { cwd, signal, timeoutMs, label: "ebur128" });
  const m = parseEbur128Summary(r.stderr);
  if (!m || m.integratedLufs == null) {
    throw new EditError("LOUDNESS_UNMEASURED", { errorClass: "transient", retryable: true, detail: String(r.stderr).slice(-400) });
  }
  return m;
}

// ---- pieces / chain ---------------------------------------------------------------------------
function toFrame(sec) { return Math.round(Number(sec) * FPS + 1e-9); }

function normalizePieces(pieces) {
  if (!Array.isArray(pieces)) return [];
  const out = [];
  for (const p of pieces) {
    if (!p || typeof p !== "object") continue;
    const inF = Math.max(0, toFrame(p.srcInS));
    const outF = Math.max(inF, toFrame(p.srcOutS));
    const rate = Number.isFinite(Number(p.rate)) && Number(p.rate) > 0 ? Math.min(4, Math.max(0.25, Number(p.rate))) : 1;
    const padF = Math.max(0, toFrame(p.padS || 0));
    const fadeMs = Number.isFinite(Number(p.fadeMs)) ? Math.min(50, Math.max(0, Number(p.fadeMs))) : DEFAULT_FADE_MS;
    const srcF = outF - inF;
    const playF = srcF === 0 ? 0 : (Math.abs(rate - 1) < 1e-6 ? srcF : Math.max(1, Math.round(srcF / rate)));
    if (playF === 0 && padF === 0) continue;
    out.push({ inF, outF, rate: Math.abs(rate - 1) < 1e-6 ? 1 : Math.round(rate * 1e6) / 1e6, padF, fadeMs, playF, samples: (playF + padF) * SPF });
  }
  return out;
}

function normalizeChain(chain) {
  const c = chain && typeof chain === "object" ? chain : {};
  const hp = Number(c.highpassHz);
  const notches = (Array.isArray(c.notchesHz) ? c.notchesHz : [])
    .map(Number).filter((f) => Number.isFinite(f) && f >= 20 && f <= 2000).map((f) => Math.round(f * 100) / 100);
  let afftdn = null;
  if (c.afftdn && typeof c.afftdn === "object") {
    const nr = Number(c.afftdn.nr), nf = Number(c.afftdn.nf);
    afftdn = {
      nr: Number.isFinite(nr) ? Math.min(40, Math.max(1, nr)) : 10,
      nf: Number.isFinite(nf) ? Math.min(-20, Math.max(-80, nf)) : -50,
    };
  } else if (c.afftdn === true) {
    afftdn = { nr: 10, nf: -50 };
  }
  return {
    highpassHz: Number.isFinite(hp) && hp > 0 ? Math.min(300, hp) : (c.highpassHz === 0 ? 0 : 80),
    notchesHz: [...new Set(notches)].sort((a, b) => a - b),
    afftdn,
    dynaudnorm: c.dynaudnorm === true,
    deesser: c.deesser === true,
  };
}

const afftdnFilter = (a) => `afftdn=nf=${a.nf}:nr=${a.nr}:tn=1`;

// Impulse through the exact afftdn string; the output peak position is its delay. Memoized per process.
const afftdnDelayMemo = new Map();
function afftdnDelaySamples(filter, { signal } = {}) {
  if (afftdnDelayMemo.has(filter)) return afftdnDelayMemo.get(filter);
  const p = (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ve-afftdn-"));
    const AT = 24000;
    try {
      const out = path.join(dir, "impulse.f32");
      await proc.ffmpeg(["-y", "-f", "lavfi", "-i", `aevalsrc=exprs='0.02*(2*random(0)-1)+0.9*eq(n,${AT})':s=${SR}:d=1`,
        "-af", filter, "-ac", "1", "-c:a", "pcm_f32le", "-f", "f32le", out], { signal, timeoutMs: 20000, label: "afftdn-calibrate" });
      const b = fs.readFileSync(out);
      let peak = 0, at = -1;
      for (let i = 0; i + 4 <= b.length; i += 4) { const v = Math.abs(b.readFloatLE(i)); if (v > peak) { peak = v; at = i / 4; } }
      const d = at - AT;
      return peak > 0.1 && d >= 0 && d < SR / 2 ? d : AFFTDN_DELAY_FALLBACK;
    } catch (e) {
      afftdnDelayMemo.delete(filter);
      if (e && e.code === "PROC_ABORTED") throw e;
      return AFFTDN_DELAY_FALLBACK;
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
    }
  })();
  afftdnDelayMemo.set(filter, p);
  return p;
}

function chainFilters(chain, { afftdnDelay = 0 } = {}) {
  const f = [];
  if (chain.highpassHz > 0) f.push(`highpass=f=${chain.highpassHz}`);
  for (const hz of chain.notchesHz) f.push(`equalizer=f=${hz}:width_type=q:width=16:g=-24`);
  if (chain.afftdn) {
    if (afftdnDelay > 0) f.push(`apad=pad_len=${afftdnDelay}`, afftdnFilter(chain.afftdn), `atrim=start_sample=${afftdnDelay}`, "asetpts=PTS-STARTPTS");
    else f.push(afftdnFilter(chain.afftdn));
  }
  if (chain.dynaudnorm) f.push("dynaudnorm=f=200:g=11");
  if (chain.deesser) f.push("deesser=i=0.4");
  return f;
}

// atempo is exact only inside 0.5..2 on older builds; chain factors so every stage stays there.
function tempoFilters(rate) {
  const f = [];
  let r = rate;
  while (r > 2 + 1e-9) { f.push("atempo=2"); r /= 2; }
  while (r < 0.5 - 1e-9) { f.push("atempo=0.5"); r /= 0.5; }
  if (Math.abs(r - 1) > 1e-9) f.push(`atempo=${Math.round(r * 1e6) / 1e6}`);
  return f;
}

const MONO48 = `aformat=sample_rates=${SR}:channel_layouts=mono`;

function buildVoiceFilter(pieces, chain, { afftdnDelay = 0 } = {}) {
  const lines = [];
  const labels = [];
  pieces.forEach((p, i) => {
    const label = `a${i}`;
    const playN = p.playF * SPF;
    const parts = [];
    if (p.playF === 0) {
      parts.push(`anullsrc=r=${SR}:cl=mono`, `atrim=end_sample=${p.padF * SPF}`, MONO48);
    } else {
      parts.push(`[0:a]atrim=start_sample=${p.inF * SPF}:end_sample=${p.outF * SPF}`, "asetpts=PTS-STARTPTS", MONO48);
      if (p.rate !== 1) parts.push(...tempoFilters(p.rate), `apad=whole_len=${playN}`, `atrim=end_sample=${playN}`, "asetpts=PTS-STARTPTS");
      const fadeN = Math.min(Math.round((p.fadeMs / 1000) * SR), Math.floor(playN / 2));
      if (fadeN > 0) {
        parts.push(`afade=t=in:start_sample=0:nb_samples=${fadeN}`, `afade=t=out:start_sample=${playN - fadeN}:nb_samples=${fadeN}`);
      }
      if (p.padF > 0) parts.push(`apad=pad_len=${p.padF * SPF}`);
    }
    lines.push(`${parts.join(",")}[${label}]`);
    labels.push(`[${label}]`);
  });
  const post = [`concat=n=${pieces.length}:v=0:a=1`, ...chainFilters(chain, { afftdnDelay })];
  lines.push(`${labels.join("")}${post.join(",")}[voice]`);
  return lines.join(";\n") + "\n";
}

function voiceKey({ pieces, chain, sourceSha, targetLufs = TARGET_LUFS }) {
  const np = normalizePieces(pieces).map((p) => [p.inF, p.outF, p.rate, p.padF, p.fadeMs]);
  return sha1(fsx.canonicalJson({ v: VOICE_VERSION, pieces: np, chain: normalizeChain(chain), source: sourceSha || null, targetLufs }));
}

// ---- main ---------------------------------------------------------------------------------------
async function buildVoiceStem({
  projectDir, pieces, chain, runId, signal, sourceRel = "work/voice48k.wav", sourceSha = null, targetLufs = TARGET_LUFS,
} = {}) {
  if (typeof projectDir !== "string" || !projectDir) throw new EditError("VOICE_EMPTY", { errorClass: "bug", detail: "projectDir is required" });
  const np = normalizePieces(pieces);
  if (!np.length) throw new EditError("VOICE_EMPTY", { status: 422, errorClass: "input", detail: "no voice pieces" });
  const nc = normalizeChain(chain);
  const rid = runId || newRunId();
  const srcAbs = fsx.resolveInside(projectDir, sourceRel);
  if (!fs.existsSync(srcAbs)) throw new EditError("VOICE_SOURCE_MISSING", { status: 409, errorClass: "input", detail: sourceRel });

  const srcSha = sourceSha || await fsx.partialSha(srcAbs);
  const key = voiceKey({ pieces, chain, sourceSha: srcSha, targetLufs });
  const relDir = "render/cache/voice";
  const dir = fsx.ensureDir(fsx.resolveInside(projectDir, relDir));
  const relPath = `${relDir}/${key}.wav`;
  const abs = path.join(dir, `${key}.wav`);
  const metaFile = path.join(dir, `${key}.json`);
  const samples = np.reduce((s, p) => s + p.samples, 0);

  const cachedMeta = fsx.readJsonSafe(metaFile);
  if (cachedMeta.ok && fs.existsSync(abs) && cachedMeta.value && cachedMeta.value.samples === samples) {
    const v = cachedMeta.value;
    return { path: abs, relPath, key, samples, durationSec: samples / SR, lufs: v.lufs, truePeakDb: v.truePeakDb, lraLu: v.lraLu, gainDb: v.gainDb, cached: true };
  }

  // Source must be 48 kHz: every sample index below assumes it (ENGINE.md normalize writes pcm_s16le 48 kHz mono).
  const probe = await proc.ffprobeJson(["-protocol_whitelist", "file", "-f", "wav", "-show_entries", "stream=sample_rate,channels,codec_type", "-of", "json", `file:${srcAbs}`], { signal, timeoutMs: 20000 });
  const st = (probe.streams || []).find((s) => s.codec_type === "audio");
  if (!st || Number(st.sample_rate) !== SR) {
    throw new EditError("VOICE_SOURCE_FORMAT", { status: 409, errorClass: "input", detail: `expected ${SR} Hz, got ${st ? st.sample_rate : "no audio"}` });
  }
  const afftdnDelay = nc.afftdn ? await afftdnDelaySamples(afftdnFilter(nc.afftdn), { signal }) : 0;

  const fcsRel = `${relDir}/${key}.fcs`;
  fs.writeFileSync(path.join(dir, `${key}.fcs`), buildVoiceFilter(np, nc, { afftdnDelay }));
  const cutRel = `${relDir}/${key}.cut.tmp.${rid}.wav`;
  const outTmpRel = `${relDir}/${key}.wav.tmp.${rid}.wav`;
  const timeoutMs = Math.max(60000, Math.round((samples / SR) * 4000));
  const opts = { cwd: projectDir, signal, timeoutMs };
  try {
    // 1. cut + fades + chain → float intermediate (no clipping before the gain step).
    await proc.ffmpeg(["-y", ...inputArgs(sourceRel, { format: "wav" }), "-/filter_complex", fcsRel, "-map", "[voice]",
      "-c:a", "pcm_f32le", "-ar", String(SR), "-ac", "1", cutRel], { ...opts, label: "voice-cut" });

    // 2. measure (loudnorm pass 1, as tts.js:522).
    const m = await proc.ffmpeg(["-loglevel", "info", "-nostats", ...inputArgs(cutRel, { format: "wav" }),
      "-af", `loudnorm=I=${targetLufs}:TP=-2:LRA=11:print_format=json`, "-f", "null", "-"], { ...opts, label: "voice-measure" });
    const meas = parseLoudnormJson(m.stderr);
    const inputI = meas && Number.isFinite(meas.inputI) ? meas.inputI : null;
    const gainDb = inputI == null || inputI < -70 ? 0 : Math.max(-GAIN_CLAMP_DB, Math.min(GAIN_CLAMP_DB, targetLufs - inputI));

    // 3. static gain + peak guard; length pinned to the planned sample count.
    const af = [`volume=${gainDb.toFixed(2)}dB`, STEM_LIMITER, `apad=whole_len=${samples}`, `atrim=end_sample=${samples}`].join(",");
    await proc.ffmpeg(["-y", ...inputArgs(cutRel, { format: "wav" }), "-af", af, "-c:a", "pcm_s16le", "-ar", String(SR), "-ac", "1", outTmpRel],
      { ...opts, label: "voice-gain" });
    fsx.renameWithRetrySync(path.join(projectDir, outTmpRel), abs);

    const loud = await measureEbur128(abs, { signal, timeoutMs });
    const meta = {
      version: VOICE_VERSION, key, samples, durationSec: samples / SR, sourceSha: srcSha, pieces: np, chain: nc, targetLufs, afftdnDelay,
      measuredInputLufs: inputI, gainDb: Math.round(gainDb * 100) / 100,
      lufs: loud.integratedLufs, truePeakDb: Number.isFinite(loud.truePeakDbtp) ? loud.truePeakDbtp : null, lraLu: loud.lraLu,
    };
    fsx.writeJsonAtomic(metaFile, meta);
    return { path: abs, relPath, key, samples, durationSec: samples / SR, lufs: meta.lufs, truePeakDb: meta.truePeakDb, lraLu: meta.lraLu, gainDb: meta.gainDb, cached: false };
  } finally {
    for (const rel of [cutRel, outTmpRel]) { try { fs.unlinkSync(path.join(projectDir, rel)); } catch { /* absent */ } }
  }
}

module.exports = {
  buildVoiceStem, voiceKey, normalizePieces, normalizeChain, buildVoiceFilter, chainFilters, afftdnDelaySamples,
  measureEbur128, parseEbur128Summary, parseLoudnormJson, inputFormatFor, inputArgs, fmt6,
  FPS, SR, SPF, TARGET_LUFS, STEM_LIMITER, VOICE_VERSION, AFFTDN_DELAY_FALLBACK,
};
