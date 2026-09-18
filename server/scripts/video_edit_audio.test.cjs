// Tests for deterministic audio + technical analysis: analysis/{dsp,audio,islands,technical}.js.
// Run: node scripts/video_edit_audio.test.cjs   (offline; fetch tripwire; needs ffmpeg; < 30 s)
//
// Load-bearing assertions:
//  - ISLANDS from lavfi tone bursts with known gaps land within ±20 ms (voiced and padded edges), short gaps merge,
//    silences are the exact complement. STT chunking, validation and the island-chat fallback all trust these edges.
//  - LONG ISLANDS split at the deepest dip in the middle 60 % until every island is ≤ 8 s.
//  - NO_SPEECH on a noise-only file (the stage must park the project instead of paying for STT of silence).
//  - HUM injected at 60 Hz (+ harmonics) is detected with notches; a clean file reports none.
//  - ebur128/astats summaries parse (canned text and a real ffmpeg run on a known sine).
//  - REAL SPEECH (probe speech.wav, if present in test-fixtures/): an island covers every ground-truth phrase onset.
//  - TECHNICAL: scene changes, black, freezes and letterbox from one ffmpeg pass over a generated proxy.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const dsp = require("../src/video_edit/analysis/dsp");
const A = require("../src/video_edit/analysis/audio");
const I = require("../src/video_edit/analysis/islands");
const TECH = require("../src/video_edit/analysis/technical");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-audio-");
const PROBE_DIR = path.join(__dirname, "..", "test-fixtures", "video_edit", "probe");
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} not within ±${tol} of ${expected}`);

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-400)}`);
}

// 16 kHz mono s16le wav from an aevalsrc expression (+ faint deterministic noise floor ≈ −71 dBFS)
function lavfiWav(name, expr, seconds, { rate = 16000, extraArgs = [] } = {}) {
  const file = path.join(tmp.dir, name);
  ffmpeg(["-f", "lavfi", "-i", `aevalsrc='${expr}+0.0005*(random(0)*2-1)':s=${rate}:d=${seconds}`, ...extraArgs, "-ac", "1", "-c:a", "pcm_s16le", file]);
  return file;
}

function projectWith(wavFile) {
  const dir = fs.mkdtempSync(path.join(tmp.dir, "proj-"));
  fs.mkdirSync(path.join(dir, "work"));
  fs.copyFileSync(wavFile, path.join(dir, "work", "audio16k.wav"));
  return dir;
}

const TONE = "0.3*sin(2*PI*220*t)";
const BURSTS = `${TONE}*(between(t,0.5,1.5)+between(t,1.8,2.6)+between(t,2.75,3.4)+between(t,4.2,5.0))`;

// ---------------------------------------------------------------- islands helpers
section("islands.js — letter ids, WAV extraction, batching");

t("letter ids are bijective base-26 (A…Z, AA…ZZ, AAA)", () => {
  assert.deepStrictEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(I.letterId), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  for (let n = 0; n < 2000; n++) assert.strictEqual(I.letterIndex(I.letterId(n)), n);
  assert.strictEqual(I.letterIndex("i1"), -1);
  assert.strictEqual(I.letterIndex("a"), -1);
});

t("encodeWav round-trips through readWav; extractIslands is sample-exact", () => {
  const sr = 16000;
  const samples = new Int16Array(sr * 2);
  for (let k = 0; k < samples.length; k++) samples[k] = (k % 997) - 498;
  const back = dsp.readWav(I.encodeWav(samples, sr));
  assert.strictEqual(back.sampleRate, sr);
  assert.deepStrictEqual(Array.from(back.samples.subarray(0, 50)), Array.from(samples.subarray(0, 50)));
  const [x] = I.extractIslands({ samples, sampleRate: sr }, [{ id: "C", start: 0.5, end: 1.25 }], { contextSec: 0.1 });
  assert.strictEqual(x.id, "C");
  assert.strictEqual(x.startSample, 6400);
  assert.strictEqual(x.endSample, 21600);
  const clip = dsp.readWav(x.wav);
  assert.strictEqual(clip.samples.length, 15200);
  assert.strictEqual(clip.samples[0], samples[6400]);
  assert.strictEqual(clip.samples[15199], samples[21599]);
});

t("batchIslands honours batchMaxSec and batchMaxIslands; regions merge with context", () => {
  const isl = Array.from({ length: 25 }, (_, k) => ({ id: I.letterId(k), start: k * 4, end: k * 4 + 3.5 }));
  const batches = I.batchIslands(isl, { batchMaxSec: 30, batchMaxIslands: 10 });
  assert.ok(batches.every((b) => b.length <= 10 && b.reduce((a, s) => a + s.end - s.start, 0) <= 30));
  assert.strictEqual(batches.flat().length, 25);
  const regions = I.islandsFromRegions([{ start: 1, end: 1.3 }, { start: 1.6, end: 1.9 }, { start: 5, end: 5.2 }], { contextSec: 0.2, durationSec: 10 });
  assert.deepStrictEqual(regions.map((r) => [r.id, r.start, r.end]), [["A", 0.8, 2.1], ["B", 4.8, 5.4]]);
});

t("readWav rejects non-WAV and downmixes 24-bit stereo", () => {
  assert.throws(() => dsp.readWav(Buffer.from("#EXTM3U\nnot audio at all, definitely not RIFF data here....")), (e) => e.code === "WAV_INVALID");
  const file = path.join(tmp.dir, "stereo24.wav");
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000:duration=0.5", "-ac", "2", "-c:a", "pcm_s24le", file]);
  const w = dsp.readWav(file);
  assert.strictEqual(w.channels, 2);
  assert.strictEqual(w.samples.length, 8000);
  // lavfi sine peaks at 1/8 full scale (4096); `-ac 2` spreads it at −3 dB per channel → 2896 after the 24→16-bit shift
  near(Math.max(...w.samples), 2896, 60, "24-bit samples scaled to 16-bit and downmixed without a level change");
});

// ---------------------------------------------------------------- islands & silences
section("audio.js — islands, silences, NO_SPEECH");

let bursts = null;
t("tone bursts: islands and silences within ±20 ms, short gap merged", () => {
  const pcm = dsp.readWav(lavfiWav("bursts.wav", BURSTS, 6));
  bursts = A.analyzePcm(pcm);
  const got = bursts.islands.map((s) => [s.id, s.voicedStart, s.voicedEnd, s.start, s.end]);
  assert.strictEqual(bursts.islands.length, 3, JSON.stringify(got));
  const expected = [
    ["A", 0.5, 1.5, 0.42, 1.58],
    ["B", 1.8, 3.4, 1.72, 3.48],          // 0.15 s gap at 2.6–2.75 merged
    ["C", 4.2, 5.0, 4.12, 5.08],
  ];
  expected.forEach(([id, vs, ve, s, e], k) => {
    const isl = bursts.islands[k];
    assert.strictEqual(isl.id, id);
    near(isl.voicedStart, vs, 0.02, `${id} voicedStart`);
    near(isl.voicedEnd, ve, 0.02, `${id} voicedEnd`);
    near(isl.start, s, 0.02, `${id} padded start`);
    near(isl.end, e, 0.02, `${id} padded end`);
    assert.strictEqual(isl.startSample, Math.round(isl.start * 16000));
  });
  const sil = bursts.silences.map((s) => [s.start, s.end]);
  assert.strictEqual(sil.length, 4, JSON.stringify(sil));
  [[0, 0.42], [1.58, 1.72], [3.48, 4.12], [5.08, 6]].forEach(([a, b], k) => { near(sil[k][0], a, 0.02, `silence ${k} start`); near(sil[k][1], b, 0.02, `silence ${k} end`); });
  // complement: islands + silences tile [0, D] exactly
  const tiles = [...bursts.islands.map((s) => [s.start, s.end]), ...sil].sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < tiles.length; k++) assert.strictEqual(tiles[k][0], tiles[k - 1][1]);
  assert.strictEqual(bursts.noSpeech, false);
  assert.ok(bursts.voicedRatio > 0.2, `voicedRatio ${bursts.voicedRatio}`);
  assert.ok(bursts.silences.every((s) => s.depthDb < -60), "silence depth is the noise floor");
});

t("a 20 s island is split at the deepest middle-60 % dips until every island is ≤ 8 s", () => {
  const expr = `${TONE}*between(t,0.5,20.5)*(1-0.97*between(t,9.0,9.12)-0.9*between(t,5.0,5.12)-0.9*between(t,14.5,14.62))`;
  // 4.5 s of room tone around the 20 s tone: the §3 floor is P10 of all frames, so the file must not be > 90 % tone
  const a = A.analyzePcm(dsp.readWav(lavfiWav("long.wav", expr, 25)));
  const spans = a.islands.map((s) => [s.id, s.start, s.end, s.split]);
  assert.strictEqual(a.islands.length, 4, JSON.stringify(spans));
  assert.ok(a.islands.every((s) => s.end - s.start <= 8 + 1e-9 && s.split), JSON.stringify(spans));
  [5.06, 9.06, 14.56].forEach((cut, k) => {
    near(a.islands[k].end, cut, 0.04, `split ${k}`);
    assert.strictEqual(a.islands[k].end, a.islands[k + 1].start, "split halves share the boundary");
  });
  assert.deepStrictEqual(a.islands.map((s) => s.id), ["A", "B", "C", "D"]);
});

t("noise-only file → noSpeech, and noSpeechError carries the NEEDS_ATTENTION actions", async () => {
  const file = lavfiWav("silence.wav", "0", 5);
  const dir = projectWith(file);
  const r = await A.analyzeAudio({ projectDir: dir, runId: "run_ns", pidFile: null });
  assert.strictEqual(r.noSpeech, true);
  assert.strictEqual(r.audio.noSpeech, true);
  assert.ok(r.audio.voicedRatio < 0.02);
  const e = A.noSpeechError();
  assert.strictEqual(e.code, "NO_SPEECH");
  assert.notStrictEqual(e.errorClass, "input", "NO_SPEECH parks the project (NEEDS_ATTENTION), never FAILED");
  assert.ok(e.extra.actions.includes("continue_without_transcript"));
});

// ---------------------------------------------------------------- hum, loudness, voice chain
section("audio.js — hum, loudness, voice chain");

t("60 Hz hum with harmonics is detected with notches; the clean file has none", () => {
  const speechy = `${TONE}*(between(t,0.5,1.5)+between(t,2,3)+between(t,3.5,4.5))`;
  const hum = "0.01*(sin(2*PI*60*t)+0.5*sin(2*PI*120*t)+0.3*sin(2*PI*180*t))";
  const withHum = A.analyzePcm(dsp.readWav(lavfiWav("hum60.wav", `${speechy}+${hum}`, 12)));
  assert.ok(withHum.hum, "hum detected");
  assert.strictEqual(withHum.hum.hz, 60);
  assert.ok(withHum.hum.notchesHz.includes(60) && withHum.hum.notchesHz.includes(120), JSON.stringify(withHum.hum));
  assert.deepStrictEqual(A.voiceChain(withHum).notchesHz.slice(0, 2), [60, 120]);
  const hum50 = A.analyzePcm(dsp.readWav(lavfiWav("hum50.wav", `${speechy}+0.01*sin(2*PI*50*t)`, 12)));
  assert.ok(hum50.hum && hum50.hum.hz === 50, JSON.stringify(hum50.hum));
  const clean = A.analyzePcm(dsp.readWav(lavfiWav("clean.wav", speechy, 12)));
  assert.strictEqual(clean.hum, null);
});

t("parseLoudness reads the ebur128 summary and astats Overall block", () => {
  const stderr = [
    "[Parsed_ebur128_0 @ 0x1] t: 2.9 TARGET:-23 LUFS M: -21.0 S:-21.0 I: -21.0 LUFS",
    "[Parsed_ebur128_0 @ 0000023501d88500] Summary:", "", "  Integrated loudness:", "    I:         -19.4 LUFS", "    Threshold: -29.5 LUFS", "",
    "  Loudness range:", "    LRA:         6.2 LU", "    Threshold: -40.0 LUFS", "", "  True peak:", "    Peak:       -2.3 dBFS",
    "[Parsed_astats_1 @ 0x2] Channel: 1", "[Parsed_astats_1 @ 0x2] Peak level dB: -9.000000",
    "[Parsed_astats_1 @ 0x2] Overall", "[Parsed_astats_1 @ 0x2] Peak level dB: -2.500000", "[Parsed_astats_1 @ 0x2] RMS level dB: -21.100000",
    "[Parsed_astats_1 @ 0x2] Number of samples: 48000", "[Parsed_astats_1 @ 0x2] Bit depth: 9/16/16/16",
  ].join("\n");
  const p = A.parseLoudness(stderr);
  assert.strictEqual(p.lufs, -19.4);
  assert.strictEqual(p.lra, 6.2);
  assert.strictEqual(p.truePeakDb, -2.3);
  assert.strictEqual(p.astats.peakLevelDB, -2.5);
  assert.strictEqual(p.astats.rMSLevelDB, -21.1);
  assert.strictEqual(p.astats.numberOfSamples, 48000);
  const silent = A.parseLoudness("Summary:\n  Integrated loudness:\n    I:  -70.0 LUFS\n  Loudness range:\n    LRA: 0.0 LU\n  True peak:\n    Peak: -inf dBFS");
  assert.strictEqual(silent.truePeakDb, null);
});

t("analyzeAudio measures a known sine (I ≈ −9 LUFS, TP ≈ −6 dBFS) and writes audio.json + rms.f32", async () => {
  const file = lavfiWav("sine.wav", "0.5*sin(2*PI*1000*t)*between(t,0.5,3.5)", 4);
  const dir = projectWith(file);
  const r = await A.analyzeAudio({ projectDir: dir, runId: "run_lufs", pidFile: null });
  near(r.audio.truePeakDb, -6, 0.6, "true peak");
  near(r.audio.lufs, -9, 1.5, "integrated loudness");
  const json = JSON.parse(fs.readFileSync(path.join(dir, A.AUDIO_REL), "utf8"));
  for (const k of ["floorDb", "speechDb", "snrDb", "lufs", "lra", "truePeakDb", "clippingRatio", "hum", "sibilance", "voiceChain", "islands", "silences", "envelopeFile"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(json, k), `audio.json has ${k}`);
  }
  const env = A.readEnvelope(path.join(dir, A.ENVELOPE_REL));
  assert.strictEqual(env.length, r.features.n);
  assert.strictEqual(env.length, Math.ceil(4 / 0.01));
  assert.ok(Math.abs(env[200] - r.features.rmsDb[200]) < 1e-4);
  assert.ok(!fs.readdirSync(path.join(dir, "analysis")).some((n) => n.includes(".tmp.")), "no temp files left");
  assert.deepStrictEqual(Object.keys(r.outputs).sort(), ["audio", "envelope"]);
});

t("voiceChain maps SNR / level / sibilance / hum to the RENDER.md §8 chain", () => {
  const base = { floorDb: -60, hum: null, levelStdevDb: 2, sibilance: 0.1 };
  assert.strictEqual(A.voiceChain({ ...base, snrDb: 30 }).afftdn, null);
  assert.deepStrictEqual(A.voiceChain({ ...base, snrDb: 18 }).afftdn, { nf: -60, nr: 10 });
  assert.deepStrictEqual(A.voiceChain({ ...base, snrDb: 12, floorDb: -95 }).afftdn, { nf: -80, nr: 18 });
  assert.strictEqual(A.voiceChain({ ...base, snrDb: 30, levelStdevDb: 4.5 }).dynaudnorm, true);
  assert.strictEqual(A.voiceChain({ ...base, snrDb: 30, sibilance: 0.4 }).deesser, true);
  const c = A.voiceChain({ ...base, snrDb: 30, hum: { hz: 50, notchesHz: [50, 100, 150] } });
  assert.deepStrictEqual([c.highpassHz, c.notchesHz, c.targetLufs], [80, [50, 100, 150], -16]);
});

// ---------------------------------------------------------------- real speech
section("audio.js — real speech probe");

const probeWav = path.join(PROBE_DIR, "speech.wav");
const probeTruth = path.join(PROBE_DIR, "ground_truth.json");
if (fs.existsSync(probeWav) && fs.existsSync(probeTruth)) {
  t("probe speech.wav: an island covers every ground-truth phrase onset; pauses are silences", async () => {
    const dir = projectWith(probeWav);
    const started = Date.now();
    const r = await A.analyzeAudio({ projectDir: dir, runId: "run_probe", pidFile: null });
    assert.ok(Date.now() - started < 10000, "fast enough for a 38 s file");
    const truth = JSON.parse(fs.readFileSync(probeTruth, "utf8")).en.timeline;
    for (const p of truth.filter((x) => x.type === "speech")) {
      const onset = p.expectedSpeechOnsetSec;
      assert.ok(r.audio.islands.some((s) => s.start <= onset + 0.05 && s.end >= onset + 0.1), `phrase ${p.id} onset ${onset} not covered`);
    }
    for (const gap of truth.filter((x) => x.type === "silence")) {
      assert.ok(r.audio.silences.some((s) => s.start <= gap.startSec + 0.4 && s.end >= gap.endSec - 0.1 && s.dur >= gap.sec * 0.7),
        `pause ${gap.startSec}-${gap.endSec} not a silence`);
    }
    assert.strictEqual(r.noSpeech, false);
    assert.ok(r.audio.islands.every((s) => s.end - s.start <= 8 + 1e-9));
    assert.ok(r.audio.snrDb > 30 && r.audio.lufs < -5 && r.audio.lufs > -40, JSON.stringify([r.audio.snrDb, r.audio.lufs]));
    assert.ok(r.discoveries.silencesFound >= 2);
  });
} else {
  t("probe speech.wav (SKIPPED: test-fixtures/video_edit/probe missing)", () => {});
}

// ---------------------------------------------------------------- technical
section("technical.js — scenes, black, freezes, letterbox");

t("parseMetadataPrint reads frame headers and key=value lines", () => {
  const frames = TECH.parseMetadataPrint("frame:90   pts:46080   pts_time:3\nlavfi.scd.score=32.7\nlavfi.scd.time=3\nlavfi.black_start=3\nframe:91 pts:46592 pts_time:3.0333\nlavfi.scd.score=0.000\n");
  assert.strictEqual(frames.length, 2);
  assert.deepStrictEqual([frames[0].frame, frames[0].t, frames[0].kv["lavfi.scd.time"], frames[1].kv["lavfi.scd.score"]], [90, 3, 3, 0]);
});

t("analyzeTechnical on a generated letterboxed proxy: 3 scenes, black 3–4.5 s, freezes, letterbox", async () => {
  const dir = fs.mkdtempSync(path.join(tmp.dir, "tech-"));
  fs.mkdirSync(path.join(dir, "work"));
  ffmpeg([
    "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=3", "-f", "lavfi", "-i", "color=black:size=320x240:rate=30:duration=1.5",
    "-f", "lavfi", "-i", "smptebars=size=320x240:rate=30:duration=3",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,pad=320:300:0:30:black[v]", "-map", "[v]",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(dir, "work", "proxy540.mp4"),
  ]);
  const r = await TECH.analyzeTechnical({ projectDir: dir, runId: "run_tech", pidFile: null });
  const v = r.video;
  near(v.durationSec, 7.5, 0.05, "duration");
  assert.deepStrictEqual([v.width, v.height], [320, 300]);
  assert.strictEqual(v.scenes.length, 3, JSON.stringify(v.scenes));
  near(v.scenes[1].start, 3, 0.05, "scene 2");
  near(v.scenes[2].start, 4.5, 0.05, "scene 3");
  assert.strictEqual(v.black.length, 1);
  near(v.black[0].start, 3, 0.05, "black start");
  near(v.black[0].end, 4.5, 0.05, "black end");
  assert.ok(v.freezes.some((f) => f.start >= 4.4 && f.end >= 7.4), JSON.stringify(v.freezes));
  assert.ok(v.letterbox && v.letterbox.detected && v.letterbox.top === 30 && v.letterbox.bottom === 30, JSON.stringify(v.letterbox));
  assert.ok(v.ydif.length >= 40 && v.exposure.yavgMean > 16);
  assert.deepStrictEqual(r.discoveries, { sceneCount: 3, letterbox: true });
  assert.ok(fs.existsSync(path.join(dir, TECH.VIDEO_REL)));
  assert.ok(!fs.readdirSync(path.join(dir, "analysis")).some((n) => n.includes(".tmp.")), "temp dir removed");
});

t("summarizeTechnical closes open ranges at the duration and flags shaky windows without scene changes", () => {
  const signalFrames = Array.from({ length: 60 }, (_, k) => ({ frame: k * 5, t: k / 6, kv: { "lavfi.signalstats.YAVG": 120, "lavfi.signalstats.YDIF": k >= 24 && k < 42 ? 20 : 1.5, "lavfi.signalstats.SATAVG": 40 } }));
  const sceneFrames = [{ frame: 0, t: 0, kv: { "lavfi.freezedetect.freeze_start": 8 } }];
  const v = TECH.summarizeTechnical({ sceneFrames, signalFrames, cropFrames: [], durationSec: 10, width: 960, height: 540, fps: 30 });
  assert.deepStrictEqual(v.freezes.map((f) => [f.start, f.end]), [[8, 10]]);
  assert.strictEqual(v.scenes.length, 1);
  assert.strictEqual(v.shaky.length, 1, JSON.stringify(v.shaky));
  near(v.shaky[0].start, 4, 0.2, "shaky start");
  near(v.shaky[0].end, 7, 0.2, "shaky end");
  const withCut = TECH.summarizeTechnical({ sceneFrames: [{ frame: 165, t: 5.5, kv: { "lavfi.scd.time": 5.5, "lavfi.scd.score": 40 } }], signalFrames, cropFrames: [], durationSec: 10, width: 960, height: 540 });
  assert.ok(withCut.shaky.every((s) => !(s.start <= 5.5 && s.end >= 5.5)), "no shaky range spans a scene change");
});

run().finally(() => { restoreFetch(); tmp.cleanup(); });
