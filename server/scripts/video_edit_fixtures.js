// Shared fixtures for the AI Video Edit analysis tests (scripts/video_edit_*.test.cjs).
//
// WHY THIS EXISTS. STT validation, disfluency recovery and island alignment are only meaningful on
// real speech energy, and tests must stay offline and deterministic. The fixture is a 38 s English
// clip with fillers ("um", "uh", "the the", "it's, it's") generated earlier by the app's own KIE TTS,
// plus its ground truth (phrase onsets/offsets). This module turns that into what EXTRACTING_AUDIO
// would have produced before TRANSCRIBING — using the production analysis/dsp.js + analysis/audio.js,
// so the tests exercise the real envelope and island detection — plus a word-level TRUTH for the
// provider mock (scripts/lib/mock_ai_providers.cjs).
//
// CONTRACT:
//   PROBE_DIR · probeFixtures() -> { dir, wav, mp3, esWav, esMp3, groundTruth } | null
//   readWav16(file) -> { sampleRate, channels, samples:Int16Array, durationSec }          (analysis/dsp.readWav)
//   analyzeSpeech(pcm) -> { envelope:{hop,rms,zcr,pitch}, audioDoc:{floorDb,speechDb,islands,silences}, analysis }
//   truthFromGroundTruth(set) -> { language, durationSec, words:[{text,start,end,filler}] }
//   makeProject(root, { wav, name }) -> { projectDir, wavAbs }
//   writeFloat32(file, array) · installMockOnlyFetch(allowedOrigin) -> { blocked, restore() }

const fs = require("node:fs");
const path = require("node:path");
const dsp = require("../src/video_edit/analysis/dsp");
const audio = require("../src/video_edit/analysis/audio");
const { envelopeFromFeatures } = require("../src/video_edit/analysis/stt/chain");

const PROBE_DIR = path.resolve(__dirname, "..", "test-fixtures", "video_edit", "probe");
const FILLER_RE = /^(?:u+m+|u+h+m*|e+r+m*|a+h+|h+m+)$/i;

function probeFixtures() {
  const f = (n) => path.join(PROBE_DIR, n);
  if (!fs.existsSync(f("speech.wav")) || !fs.existsSync(f("ground_truth.json"))) return null;
  return {
    dir: PROBE_DIR, wav: f("speech.wav"), mp3: f("speech.mp3"), esWav: f("speech_es.wav"), esMp3: f("speech_es.mp3"),
    groundTruth: JSON.parse(fs.readFileSync(f("ground_truth.json"), "utf8")),
  };
}

function readWav16(file) {
  return dsp.readWav(file);
}

function analyzeSpeech(pcm) {
  const analysis = audio.analyzePcm({ samples: pcm.samples, sampleRate: pcm.sampleRate });
  return {
    envelope: envelopeFromFeatures(analysis.features),
    audioDoc: { floorDb: analysis.floorDb, speechDb: analysis.speechDb, islands: analysis.islands, silences: analysis.silences },
    analysis,
  };
}

function truthFromGroundTruth(set) {
  const words = [];
  for (const ph of set.timeline) {
    if (ph.type !== "speech") continue;
    const tokens = String(ph.text).split(/\s+/).filter(Boolean);
    const on = ph.expectedSpeechOnsetSec, off = ph.expectedSpeechOffsetSec;
    const total = tokens.reduce((a, t) => a + t.length, 0);
    let cursor = on;
    tokens.forEach((t, k) => {
      const len = ((off - on) * t.length) / total;
      const end = k === tokens.length - 1 ? off : cursor + len;
      const bare = t.toLowerCase().replace(/[\p{P}]+/gu, "");
      words.push({ text: t, start: +cursor.toFixed(3), end: +end.toFixed(3), filler: ph.filler != null || FILLER_RE.test(bare) });
      cursor = end;
    });
  }
  return { language: set.lang, durationSec: set.totalSec, words };
}

function makeProject(root, { wav, name = "proj" } = {}) {
  const projectDir = path.join(root, name);
  for (const d of ["work", "analysis", "analysis/stt"]) fs.mkdirSync(path.join(projectDir, d), { recursive: true });
  const wavAbs = path.join(projectDir, "work", "audio16k.wav");
  fs.copyFileSync(wav, wavAbs);
  return { projectDir, wavAbs };
}

function writeFloat32(file, arr) {
  const buf = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

function installMockOnlyFetch(allowedOrigin) {
  const original = globalThis.fetch;
  const blocked = [];
  globalThis.fetch = function guardedFetch(input, init) {
    let u;
    try { u = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url); }
    catch { blocked.push("<bad url>"); return Promise.reject(new Error("network access is forbidden in video_edit tests")); }
    if (u.origin !== allowedOrigin) {
      blocked.push(u.host);
      return Promise.reject(new Error(`network access to ${u.host} is forbidden in video_edit tests`));
    }
    return original(input, init);
  };
  return { blocked, restore() { globalThis.fetch = original; } };
}

// =================================================================================================================
// FIXTURE GENERATOR (CLI) — ENGINE.md §9 / ARCHITECTURE.md "Verification".
//
// WHY. Unit tests run on the 38 s probe; the phases after analysis need whole talking-head videos whose truth is
// KNOWN: which words were said, where every filler and silence sits, where the shot changes, which way the
// container is rotated. So speech is synthesized one clip per phrase / filler through the app's OWN TTS
// (services/tts.synthesize: KIE → OpenRouter; msedge-tts is blocked with a require stub, exactly like the probe),
// clips are joined with sample-exact silences, and the picture is one CC0 / CC-BY Openverse portrait (keyless;
// attribution recorded) animated with ffmpeg: a breathing zoom, a pan for the moving person, hard cuts between
// three framings/grades for scene cuts. Two scenarios also get container variants (rotated .mov, VFR .mp4).
// Everything is cached (TTS clips by content hash, finished fixtures unless --force) and spend is measured as the
// KIE credit / OpenRouter usage delta around the run.
//
// USAGE:
//   node scripts/video_edit_fixtures.js --list
//   node scripts/video_edit_fixtures.js --only talking_20s_en_vertical,filler_words_en,lang_es_20s [--force] [--cap 0.25]
//   node scripts/video_edit_fixtures.js --all [--cap 1]
// OUTPUT (server/test-fixtures/video_edit/, gitignored): <id>.mp4 · <id>.truth.json · variants <id>.rotated.mov /
//   <id>.vfr.mp4 · manifest.lock.json · _assets/portrait.jpg + portrait.json · _clips/ (TTS cache) · _work/
// Library exports (no network, no config): SCENARIOS · FIXTURE_DIR · fixturePaths(id) · loadFixture(id) ·
//   renderTalkingVideo({ speechWav, out, width, height, visuals, durationSec, sceneCuts, portrait }) · assembleSpeech(...)

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const FIXTURE_DIR = path.resolve(__dirname, "..", "test-fixtures", "video_edit");
const ASSET_DIR = path.join(FIXTURE_DIR, "_assets");
const CLIP_DIR = path.join(FIXTURE_DIR, "_clips");
const WORK_DIR = path.join(FIXTURE_DIR, "_work");
const MANIFEST = path.join(FIXTURE_DIR, "manifest.lock.json");
const AUDIO_SR = 48000;
const FPS = 30;
const EST_CLIP_USD = 0.003;
const KIE_CREDIT_USD = 0.005;

const V = { width: 720, height: 1280, orientation: "portrait" };
const Hz = { width: 1280, height: 720, orientation: "landscape" };
const seg = (id, text, extra = {}) => ({ id, text, ...extra });
const sil = (sec) => ({ sil: sec });
const filler = (id, text, kind) => ({ id, text, filler: kind });

const SCENARIOS = Object.freeze({
  talking_20s_en_vertical: {
    lang: "en", voice: "bella", ...V, visuals: "breathing", variants: ["rotated_mov"],
    segs: [sil(0.3), seg("p1", "Hi, I'm going to show you three simple ways to save an hour every day."), sil(0.6),
      seg("p2", "First, batch all of your email into two short blocks."), sil(0.5),
      seg("p3", "Second, turn off every notification you don't really need."), sil(0.5),
      seg("p4", "And third, plan tomorrow before you close your laptop tonight."), sil(0.6),
      seg("p5", "Follow for more tips like this."), sil(0.4)],
  },
  filler_words_en: {
    lang: "en", voice: "tom", ...Hz, visuals: "breathing", variants: ["vfr"],
    segs: [sil(0.3), seg("p1", "So I wanted to talk about pricing for a minute."), filler("f1", "Um...", "um"),
      seg("p2", "because honestly, I, I think most freelancers get it completely wrong."), sil(0.8),
      seg("p3", "You know, they, they charge by the hour."), filler("f2", "Uh...", "uh"),
      seg("p4", "and that basically punishes you for being fast."), sil(0.7), filler("f3", "Hmm...", "hmm"),
      seg("p5", "Charge for the result instead."), sil(0.4)],
  },
  educational_30s_en_horizontal_scenecuts: {
    lang: "en", voice: "benjamin", ...Hz, visuals: "scenecuts", sceneCutBefore: ["p3", "p5"],
    segs: [sil(0.3), seg("p1", "Why does the sky look blue during the day but red at sunset?"), sil(0.7),
      seg("p2", "Sunlight contains every color, and air molecules scatter short blue waves the most."), sil(0.8),
      seg("p3", "So when the sun is high, that scattered blue light reaches your eyes from every direction."), sil(0.8),
      seg("p4", "At sunset the light travels through far more air, and most of the blue is scattered away."), sil(0.8),
      seg("p5", "What's left are the long red and orange waves. Subscribe for more everyday science."), sil(0.4)],
  },
  consultant_60s_en_pauses: {
    lang: "en", voice: "brian", ...Hz, visuals: "breathing",
    segs: [sil(0.4), seg("p1", "Most companies I work with don't have a sales problem."), sil(2.2),
      seg("p2", "They have a follow-up problem."), sil(1.8),
      seg("p3", "Eighty percent of deals close after the fifth contact, but most teams stop after two."), sil(2.5),
      seg("p4", "When I audited one client's pipeline, we found forty qualified leads nobody had called back."), sil(2.0),
      seg("p5", "We built a simple seven day cadence: a call, an email, a short video, and a check-in."), sil(2.4),
      seg("p6", "Within one quarter, their close rate went from twelve to twenty one percent."), sil(2.0),
      seg("p7", "It wasn't new software. It was discipline."), sil(2.6),
      seg("p8", "If you want the exact cadence, the link is in the description."), sil(0.5)],
  },
  long_silence_en: {
    lang: "en", voice: "liam", ...V, visuals: "breathing",
    segs: [sil(0.3), seg("p1", "Here is the one setting that doubled my battery life."), sil(6.0),
      seg("p2", "Sorry, I lost my train of thought. It's the background refresh toggle."), sil(0.6),
      seg("p3", "Turn it off for every app you don't use daily."), sil(0.4)],
  },
  poor_audio_en: {
    lang: "en", voice: "james", ...V, visuals: "breathing", audio: { gainDb: -14, noise: { color: "pink", amplitude: 0.02, seed: 7 } },
    segs: [sil(0.3), seg("p1", "I'm recording this outside, so the sound isn't perfect."), sil(0.6),
      seg("p2", "Today we're looking at three plants that survive almost any balcony."), sil(0.6),
      seg("p3", "The first one is rosemary, which loves wind and full sun."), sil(0.4)],
  },
  moving_person_en: {
    lang: "en", voice: "emma", ...V, visuals: "pan",
    segs: [sil(0.3), seg("p1", "Walk with me while I explain how we plan a launch week."), sil(0.6),
      seg("p2", "Monday is for final testing, Tuesday for the press kit, and Wednesday we go live."), sil(0.6),
      seg("p3", "Thursday and Friday are only for listening to customers."), sil(0.4)],
  },
  lang_hi_20s: {
    lang: "hi", voice: "bella", ...V, visuals: "breathing",
    segs: [sil(0.3), seg("h1", "नमस्ते दोस्तों, आज मैं आपको एक आसान तरीका बताऊँगा।"), filler("f1", "अं...", "अं"),
      seg("h2", "हमने तीन महीने तक असली ग्राहकों के साथ इसे परखा।"), sil(1.0), seg("h3", "नतीजे हमारी उम्मीद से कहीं बेहतर रहे।"), sil(0.4)],
  },
  lang_es_20s: {
    lang: "es", voice: "tom", ...V, visuals: "breathing",
    segs: [sil(0.3), seg("e1", "Hola a todos, hoy les quiero mostrar un truco muy sencillo."), filler("f1", "Eh...", "eh"),
      seg("e2", "Lo probamos durante tres meses con clientes reales."), sil(0.8),
      seg("e3", "Y los resultados fueron mucho mejores de lo que esperábamos."), sil(0.5),
      seg("e4", "Síguenos para más consejos."), sil(0.4)],
  },
  lang_fr_20s: {
    lang: "fr", voice: "laura", ...V, visuals: "breathing",
    segs: [sil(0.3), seg("r1", "Bonjour à tous, aujourd'hui je vais vous montrer une astuce simple."), filler("f1", "Euh...", "euh"),
      seg("r2", "Nous l'avons testée pendant trois mois avec de vrais clients."), sil(1.0), seg("r3", "Et les résultats ont dépassé nos attentes."), sil(0.4)],
  },
  lang_de_20s: {
    lang: "de", voice: "brian", ...V, visuals: "breathing",
    segs: [sil(0.3), seg("d1", "Hallo zusammen, heute zeige ich euch einen einfachen Trick."), filler("f1", "Äh...", "äh"),
      seg("d2", "Wir haben ihn drei Monate lang mit echten Kunden getestet."), sil(1.0), seg("d3", "Und die Ergebnisse waren viel besser als erwartet."), sil(0.4)],
  },
  lang_pt_20s: {
    lang: "pt", voice: "allison", ...V, visuals: "breathing",
    segs: [sil(0.3), seg("o1", "Olá pessoal, hoje eu vou mostrar um truque simples."), filler("f1", "Hã...", "hã"),
      seg("o2", "Nós testamos durante três meses com clientes reais."), sil(1.0), seg("o3", "E os resultados foram muito melhores do que esperávamos."), sil(0.4)],
  },
  lang_ar_20s: {
    lang: "ar", voice: "benjamin", ...V, visuals: "breathing",
    segs: [sil(0.3), seg("a1", "مرحبا بالجميع، اليوم سأريكم حيلة بسيطة."), filler("f1", "آه...", "آه"),
      seg("a2", "جربناها لمدة ثلاثة أشهر مع عملاء حقيقيين."), sil(1.0), seg("a3", "وكانت النتائج أفضل بكثير مما توقعنا."), sil(0.4)],
  },
  lang_ja_20s: {
    lang: "ja", voice: "emma", ...V, visuals: "breathing",
    segs: [sil(0.3), seg("j1", "皆さん、こんにちは。今日は簡単なコツを紹介します。"), filler("f1", "えーと...", "えーと"),
      seg("j2", "実際のお客様と三か月間テストしました。"), sil(1.0), seg("j3", "結果は予想よりずっと良かったです。"), sil(0.4)],
  },
});

const sha256Of = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const r3g = (x) => Math.round(x * 1000) / 1000;
const evenPx = (n) => Math.max(2, 2 * Math.round(n / 2));

function ffRun(args, { allowFail = false } = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) throw new Error(`ffmpeg failed: ${String(r.stderr || "").slice(-400)}`);
  return r;
}

function samplesOf(wav) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration_ts", "-of", "json", wav], { encoding: "utf8", windowsHide: true });
  return Number(JSON.parse(r.stdout).streams[0].duration_ts);
}

function edgesOf(wav, sampleRate) {
  const r = ffRun(["-i", wav, "-af", "silencedetect=noise=-40dB:d=0.04", "-f", "null", "-"], { allowFail: true });
  const err = r.stderr || "";
  const starts = [...err.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...err.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const dur = samplesOf(wav) / sampleRate;
  let lead = 0, trail = 0;
  if (starts.length && starts[0] <= 0.01 && ends.length) lead = ends[0];
  if (starts.length && starts[starts.length - 1] > 0.01 && starts.length > ends.length) trail = dur - starts[starts.length - 1];
  return { lead: r3g(lead), trail: r3g(trail), dur };
}

function fixturePaths(id) {
  return {
    mp4: path.join(FIXTURE_DIR, `${id}.mp4`), truth: path.join(FIXTURE_DIR, `${id}.truth.json`),
    rotated: path.join(FIXTURE_DIR, `${id}.rotated.mov`), vfr: path.join(FIXTURE_DIR, `${id}.vfr.mp4`), work: path.join(WORK_DIR, id),
  };
}

function loadFixture(id) {
  const p = fixturePaths(id);
  if (!fs.existsSync(p.mp4) || !fs.existsSync(p.truth)) return null;
  return { ...p, truthDoc: JSON.parse(fs.readFileSync(p.truth, "utf8")) };
}

function clipKey(lang, voice, text) {
  return crypto.createHash("sha1").update(`${lang}|${voice}|${text}`).digest("hex").slice(0, 12);
}

// Joins per-phrase clips (already 48 kHz mono wavs) and exact silences; returns the ground-truth timeline.
function assembleSpeech({ scenario, clipWavs, out }) {
  const inputs = [];
  const filters = [];
  const timeline = [];
  let cursor = 0;
  scenario.segs.forEach((s, idx) => {
    if (s.sil) {
      const n = Math.round(s.sil * AUDIO_SR);
      inputs.push("-f", "lavfi", "-i", `anullsrc=r=${AUDIO_SR}:cl=mono`);
      filters.push(`[${idx}:a]atrim=end_sample=${n},asetpts=N/SR/TB[a${idx}]`);
      timeline.push({ type: "silence", sec: s.sil, startSec: r3g(cursor / AUDIO_SR), endSec: r3g((cursor + n) / AUDIO_SR), samples: n });
      cursor += n;
      return;
    }
    const wav = clipWavs[s.id];
    const n = samplesOf(wav);
    const e = edgesOf(wav, AUDIO_SR);
    inputs.push("-i", wav);
    filters.push(`[${idx}:a]aformat=sample_fmts=s16:sample_rates=${AUDIO_SR}:channel_layouts=mono[a${idx}]`);
    timeline.push({
      type: "speech", id: s.id, text: s.text, filler: s.filler || null, startSec: r3g(cursor / AUDIO_SR), endSec: r3g((cursor + n) / AUDIO_SR), samples: n,
      clipLeadSilenceSec: e.lead, clipTrailSilenceSec: e.trail,
      expectedSpeechOnsetSec: r3g(cursor / AUDIO_SR + e.lead), expectedSpeechOffsetSec: r3g((cursor + n) / AUDIO_SR - e.trail),
    });
    cursor += n;
  });
  const labels = timeline.map((_, i) => `[a${i}]`).join("");
  const post = scenario.audio || null;
  let graph = `${filters.join(";")};${labels}concat=n=${timeline.length}:v=0:a=1[cat]`;
  if (post) {
    const D = cursor / AUDIO_SR;
    const nz = post.noise || { color: "pink", amplitude: 0.02, seed: 7 };
    graph += `;[cat]volume=${Number(post.gainDb) || 0}dB[quiet];anoisesrc=d=${D.toFixed(6)}:c=${nz.color}:r=${AUDIO_SR}:a=${nz.amplitude}:seed=${nz.seed}[nz];[quiet][nz]amix=inputs=2:duration=first:normalize=0[out]`;
  } else {
    graph += ";[cat]anull[out]";
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const scriptFile = `${out}.graph.txt`;
  fs.writeFileSync(scriptFile, graph);
  ffRun([...inputs, "-/filter_complex", scriptFile, "-map", "[out]", "-ar", String(AUDIO_SR), "-ac", "1", "-c:a", "pcm_s16le", out]);
  fs.unlinkSync(scriptFile);
  return { timeline, samples: cursor, durationSec: cursor / AUDIO_SR };
}

function renderTalkingVideo({ speechWav, out, width, height, visuals = "breathing", durationSec, sceneCuts = [], portrait }) {
  const W = width, H = height, D = Number(durationSec);
  const cw = evenPx(W * 1.3), ch = evenPx(H * 1.3);
  const pre = `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch}:(iw-ow)/2:(ih-oh)*0.3`;
  let z = "1.04+0.025*sin(2*PI*on/120)";
  let x = "iw/2-(iw/zoom/2)";
  let y = "ih/2-(ih/zoom/2)";
  let grade = "";
  if (visuals === "pan") {
    z = "1.3";
    x = "(iw-iw/zoom)/2+(iw-iw/zoom)/2*0.9*sin(2*PI*on/210)";
    y = "(ih-ih/zoom)/2+(ih-ih/zoom)/2*0.25*sin(2*PI*on/150)";
  } else if (visuals === "scenecuts" && sceneCuts.length >= 2) {
    const [t1, t2] = sceneCuts.map((c) => Math.round(c * FPS));
    z = `if(lt(on,${t1}),1.05,if(lt(on,${t2}),1.45,1.2))`;
    y = `if(lt(on,${t1}),ih/2-(ih/zoom/2),if(lt(on,${t2}),(ih-ih/zoom)*0.25,(ih-ih/zoom)*0.6))`;
    grade = `,eq=saturation=1.4:brightness=0.05:enable='between(t,${sceneCuts[0].toFixed(3)},${sceneCuts[1].toFixed(3)})',eq=saturation=0.6:contrast=1.15:enable='gte(t,${sceneCuts[1].toFixed(3)})'`;
  }
  const graph = `[0:v]${pre},zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${W}x${H}:fps=${FPS}${grade},format=yuv420p[v]`;
  const tmpOut = `${out}.tmp.mp4`;
  const scriptFile = `${out}.vgraph.txt`;
  fs.writeFileSync(scriptFile, graph);
  try {
    ffRun(["-loop", "1", "-framerate", String(FPS), "-t", D.toFixed(6), "-i", portrait, "-i", speechWav, "-/filter_complex", scriptFile,
      "-map", "[v]", "-map", "1:a", "-t", D.toFixed(6), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "128k", "-ar", String(AUDIO_SR), "-movflags", "+faststart", tmpOut]);
    fs.renameSync(tmpOut, out);
  } finally {
    try { fs.unlinkSync(scriptFile); } catch { /* gone */ }
    try { fs.unlinkSync(tmpOut); } catch { /* renamed */ }
  }
  return out;
}

function makeRotatedVariant(src, out, workDir) {
  const tmp = path.join(workDir, "rot_src.mp4");
  ffRun(["-i", src, "-vf", "transpose=1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "copy", tmp]);
  ffRun(["-display_rotation", "90", "-i", tmp, "-map", "0", "-c", "copy", "-f", "mov", out]);
  fs.unlinkSync(tmp);
  return out;
}

function makeVfrVariant(src, out, workDir, durationSec) {
  const half = (durationSec / 2).toFixed(6);
  const a = path.join(workDir, "vfr_a.mp4");
  const b = path.join(workDir, "vfr_b.mp4");
  ffRun(["-i", src, "-t", half, "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", a]);
  ffRun(["-ss", half, "-i", src, "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", b]);
  const list = path.join(workDir, "vfr_list.txt");
  fs.writeFileSync(list, `file '${a.replace(/\\/g, "/")}'\nfile '${b.replace(/\\/g, "/")}'\n`);
  ffRun(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  for (const f of [a, b, list]) fs.unlinkSync(f);
  return out;
}

function wordsFromTimeline(timeline) {
  const words = [];
  for (const ph of timeline) {
    if (ph.type !== "speech") continue;
    const tokens = String(ph.text).split(/\s+/).filter(Boolean);
    const on = ph.expectedSpeechOnsetSec, off = ph.expectedSpeechOffsetSec;
    const total = tokens.reduce((a, tk) => a + tk.length, 0) || 1;
    let cursor = on;
    tokens.forEach((tk, k) => {
      const end = k === tokens.length - 1 ? off : cursor + ((off - on) * tk.length) / total;
      words.push({ text: tk, start: r3g(cursor), end: r3g(end), filler: ph.filler != null, phrase: ph.id, phraseInitial: k === 0 });
      cursor = end;
    });
  }
  return words;
}

async function ensurePortrait(log) {
  const jpg = path.join(ASSET_DIR, "portrait.jpg");
  const meta = path.join(ASSET_DIR, "portrait.json");
  if (fs.existsSync(jpg) && fs.existsSync(meta)) return { file: jpg, attribution: JSON.parse(fs.readFileSync(meta, "utf8")) };
  const ov = require("../src/video_edit/broll/providers/openverse_raw");
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  for (const query of ["headshot portrait", "portrait woman smiling", "portrait man looking at camera"]) {
    let res = null;
    for (let attempt = 1; attempt <= 2 && !res; attempt++) {
      // Measured 2026-09-14: anonymous Openverse searches can take ~60 s without being rate limited.
      try { res = await ov.search({ query, perPage: 20, licenses: ["cc0", "by"], timeoutMs: 90000 }); }
      catch (e) { log(`openverse search failed (${e.code || e.message}), attempt ${attempt}`); }
    }
    if (!res) continue;
    // Tall photos, short edge ≥ 600 px (the common 683×1024 Flickr size upscales ~1.05× into a 720-wide frame); largest first.
    const cands = res.items
      .filter((i) => Math.min(i.width, i.height) >= 600 && i.height >= i.width * 0.95 && i.height <= i.width * 1.8)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    for (const c of cands) {
      const orig = c.renditions.find((r) => r.quality === "original");
      if (!orig) continue;
      try {
        const r = await fetch(orig.url, { signal: AbortSignal.timeout(30000), redirect: "follow" });
        if (!r.ok) { log(`portrait candidate ${c.provider}:${String(c.providerId).slice(0, 8)} HTTP ${r.status}`); continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 50 * 1024 || buf.length > 15 * 1024 * 1024 || buf.readUInt16BE(0) !== 0xffd8) { log(`portrait candidate ${String(c.providerId).slice(0, 8)} rejected (${buf.length} bytes)`); continue; }
        // Downscale once (long edge ≤ 1920): renders loop this still for every frame.
        const origFile = `${jpg}.orig.jpg`;
        fs.writeFileSync(origFile, buf);
        ffRun(["-i", origFile, "-vf", "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'", "-frames:v", "1", "-update", "1", "-q:v", "2", jpg]);
        fs.unlinkSync(origFile);
        const attribution = {
          provider: "openverse", providerId: c.providerId, title: c.title, author: c.author, license: c.license, licenseCode: c.licenseCode,
          licenseUrl: c.licenseUrl, pageUrl: c.pageUrl, attribution: c.attribution, source: c.source, width: c.width, height: c.height, query,
          sha256: crypto.createHash("sha256").update(buf).digest("hex"), fetchedAt: new Date().toISOString(),
        };
        fs.writeFileSync(meta, JSON.stringify(attribution, null, 2));
        return { file: jpg, attribution };
      } catch (e) {
        log(`portrait candidate ${String(c.providerId).slice(0, 8)} failed (${String((e && (e.code || e.name)) || "error")}: ${String((e && e.message) || "").slice(-160)})`);
      }
    }
  }
  throw new Error("no usable CC0/CC-BY portrait found on Openverse");
}

async function kieCredits(key) {
  if (!key) return null;
  try {
    const r = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const n = Number(j && j.data);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

async function openrouterUsage(cfg) {
  const key = cfg && cfg.llm && cfg.llm.apiKey;
  if (!key) return null;
  try {
    const r = await fetch(`${String(cfg.llm.baseUrl || "https://openrouter.ai/api/v1").replace(/\/$/, "")}/credits`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const n = Number(j && j.data && j.data.total_usage);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

async function generateScenario(id, { tts, portrait, force, log, budget }) {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`unknown scenario ${id}`);
  const p = fixturePaths(id);
  if (!force && fs.existsSync(p.mp4) && fs.existsSync(p.truth)) return { id, status: "cached" };
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  fs.mkdirSync(p.work, { recursive: true });
  const speechSegs = sc.segs.filter((s) => s.text);
  const missing = speechSegs.filter((s) => !fs.existsSync(path.join(CLIP_DIR, `${sc.lang}_${clipKey(sc.lang, sc.voice, s.text)}.mp3`)));
  const est = missing.length * EST_CLIP_USD;
  if (!budget.allow(est)) return { id, status: "skipped_budget", estimateUsd: est };
  const session = {};
  const providers = {};
  const clipWavs = {};
  let synthesized = 0;
  for (const s of speechSegs) {
    const base = path.join(CLIP_DIR, `${sc.lang}_${clipKey(sc.lang, sc.voice, s.text)}`);
    if (!fs.existsSync(`${base}.mp3`)) {
      const meta = {};
      await tts.synthesize({ script: s.text, voice: sc.voice, outputPath: `${base}.mp3`, session, meta });
      providers[s.id] = meta.provider || null;
      synthesized++;
      budget.book(EST_CLIP_USD);
    } else {
      providers[s.id] = "cache";
    }
    if (!fs.existsSync(`${base}.48k.wav`)) ffRun(["-i", `${base}.mp3`, "-ar", String(AUDIO_SR), "-ac", "1", "-c:a", "pcm_s16le", `${base}.48k.wav`]);
    clipWavs[s.id] = `${base}.48k.wav`;
  }
  const speechWav = path.join(p.work, "speech.wav");
  const asm = assembleSpeech({ scenario: sc, clipWavs, out: speechWav });
  const D = asm.durationSec;
  const sceneCuts = [];
  for (const target of sc.sceneCutBefore || []) {
    const k = asm.timeline.findIndex((x) => x.id === target);
    const prev = asm.timeline[k - 1];
    if (k > 0) sceneCuts.push(r3g(prev && prev.type === "silence" ? (prev.startSec + prev.endSec) / 2 : asm.timeline[k].startSec));
  }
  log(`${id}: speech ${D.toFixed(2)} s (${synthesized} new clips) → rendering ${sc.width}x${sc.height} ${sc.visuals}`);
  renderTalkingVideo({ speechWav, out: p.mp4, width: sc.width, height: sc.height, visuals: sc.visuals, durationSec: D, sceneCuts, portrait: portrait.file });

  const variants = {};
  if ((sc.variants || []).includes("rotated_mov")) { makeRotatedVariant(p.mp4, p.rotated, p.work); variants.rotated_mov = path.basename(p.rotated); }
  if ((sc.variants || []).includes("vfr")) { makeVfrVariant(p.mp4, p.vfr, p.work, D); variants.vfr = path.basename(p.vfr); }
  try {
    const { probeStrict } = require("../src/video_edit/media/probe_strict");
    if (variants.rotated_mov) {
      const pr = await probeStrict(p.rotated, { demuxer: "mov" });
      variants.rotatedProbe = { rotation: pr.video.rotation, displayWidth: pr.video.displayWidth, displayHeight: pr.video.displayHeight };
    }
    if (variants.vfr) {
      const pr = await probeStrict(p.vfr, { demuxer: "mov" });
      variants.vfrProbe = { vfr: pr.video.vfr, rFps: pr.video.rFps, avgFps: pr.video.avgFps };
    }
  } catch (e) { variants.probeError = String(e.code || e.message).slice(0, 80); }

  const words = wordsFromTimeline(asm.timeline);
  const truth = {
    schemaVersion: 1, id, lang: sc.lang, totalSec: r3g(D), durationSec: r3g(D), width: sc.width, height: sc.height, fps: FPS,
    orientation: sc.orientation, visuals: sc.visuals, sceneCuts, audio: sc.audio || null, voice: sc.voice,
    timeline: asm.timeline, words,
    fillers: asm.timeline.filter((x) => x.type === "speech" && x.filler).map((x) => ({ id: x.id, text: x.text, kind: x.filler, start: x.expectedSpeechOnsetSec, end: x.expectedSpeechOffsetSec })),
    silences: asm.timeline.filter((x) => x.type === "silence").map((x) => ({ start: x.startSec, end: x.endSec, dur: x.sec })),
    tts: { providers, synthesized }, portrait: portrait.attribution, variants,
    note: "word times inside a phrase are proportional estimates; phrase onsets/offsets are measured (silencedetect −40 dB)",
  };
  fs.writeFileSync(p.truth, JSON.stringify(truth, null, 2));
  return { id, status: "generated", durationSec: r3g(D), synthesized, providers, variants, sha256: sha256Of(p.mp4), bytes: fs.statSync(p.mp4).size };
}

async function generateFixtures(argv = []) {
  const args = { only: null, all: false, force: false, list: false, cap: 0.25 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") args.only = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--all") args.all = true;
    else if (a === "--force") args.force = true;
    else if (a === "--list") args.list = true;
    else if (a === "--cap") args.cap = Number(argv[++i]);
  }
  const manifest = (() => { try { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch { return { schemaVersion: 1, scenarios: {} }; } })();
  if (args.list || (!args.only && !args.all)) {
    for (const id of Object.keys(SCENARIOS)) console.log(`${id.padEnd(42)} ${fs.existsSync(fixturePaths(id).mp4) ? "generated" : "pending"}`);
    if (!args.list) console.log("\nchoose --only <ids> or --all");
    return { listed: true };
  }
  const ids = args.all ? Object.keys(SCENARIOS) : args.only;
  for (const id of ids) if (!SCENARIOS[id]) throw new Error(`unknown scenario ${id}`);

  // msedge-tts is forbidden (user rule): block it before services/tts can require it.
  const Module = require("node:module");
  const origLoad = Module._load;
  Module._load = function blockEdge(request, ...rest) {
    if (request === "msedge-tts") throw new Error("msedge-tts is blocked for video edit fixtures");
    return origLoad.call(this, request, ...rest);
  };
  const config = require("../src/config");
  const tts = require("../src/services/tts");
  const kieKey = (config.audio && config.audio.ttsKieKey) || (config.llm && config.llm.primary && config.llm.primary.apiKey) || process.env.KIE_API_KEY || "";
  const log = (m) => console.log(`[fixtures] ${m}`);
  const creditsBefore = await kieCredits(kieKey);
  const orBefore = await openrouterUsage(config);
  let estimated = 0;
  const cap = Number.isFinite(args.cap) && args.cap > 0 ? args.cap : 0.25;
  const budget = { allow: (usd) => estimated + usd <= cap + 1e-9, book: (usd) => { estimated += usd; } };

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const portrait = await ensurePortrait(log);
  const results = [];
  for (const id of ids) {
    const t0 = Date.now();
    try {
      const r = await generateScenario(id, { tts, portrait, force: args.force, log, budget });
      r.ms = Date.now() - t0;
      results.push(r);
      log(`${id}: ${r.status}${r.durationSec ? ` ${r.durationSec}s` : ""}`);
      if (r.status === "generated") {
        const p = fixturePaths(id);
        manifest.scenarios[id] = {
          status: "generated", generatedAt: new Date().toISOString(), durationSec: r.durationSec,
          files: {
            mp4: { path: path.basename(p.mp4), sha256: r.sha256, bytes: r.bytes },
            truth: { path: path.basename(p.truth), sha256: sha256Of(p.truth) },
            ...(r.variants.rotated_mov ? { rotated_mov: { path: path.basename(p.rotated), sha256: sha256Of(p.rotated) } } : {}),
            ...(r.variants.vfr ? { vfr: { path: path.basename(p.vfr), sha256: sha256Of(p.vfr) } } : {}),
          },
          tts: { synthesized: r.synthesized, providers: [...new Set(Object.values(r.providers))] },
        };
      }
    } catch (e) {
      results.push({ id, status: "failed", error: String((e && e.message) || e).slice(0, 200) });
      log(`${id}: FAILED ${String((e && e.message) || e).slice(0, 200)}`);
    }
  }
  const creditsAfter = await kieCredits(kieKey);
  const orAfter = await openrouterUsage(config);
  const kieUsd = creditsBefore != null && creditsAfter != null ? r3g((creditsBefore - creditsAfter) * KIE_CREDIT_USD * 1000) / 1000 : null;
  const orUsd = orBefore != null && orAfter != null ? Math.round((orAfter - orBefore) * 1e6) / 1e6 : null;
  manifest.schemaVersion = 1;
  manifest.generator = "scripts/video_edit_fixtures.js";
  manifest.portrait = portrait.attribution;
  manifest.runs = [...(Array.isArray(manifest.runs) ? manifest.runs : []), {
    at: new Date().toISOString(), ids, results: results.map((r) => ({ id: r.id, status: r.status, ms: r.ms })),
    spend: { kieCreditsUsed: creditsBefore != null && creditsAfter != null ? r3g(creditsBefore - creditsAfter) : null, kieUsd, openrouterUsageDeltaUsd: orUsd, estimatedUsd: r3g(estimated) },
  }].slice(-20);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  const summary = { results, spend: { kieUsd, openrouterUsageDeltaUsd: orUsd, note: "OpenRouter delta is account-wide (other sessions may contribute)" } };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = {
  PROBE_DIR, probeFixtures, readWav16, analyzeSpeech, truthFromGroundTruth, makeProject, writeFloat32, installMockOnlyFetch,
  SCENARIOS, FIXTURE_DIR, fixturePaths, loadFixture, assembleSpeech, renderTalkingVideo, wordsFromTimeline, generateFixtures,
};

if (require.main === module) {
  generateFixtures(process.argv.slice(2)).catch((e) => {
    console.error(`[fixtures] FAILED: ${String((e && e.message) || e).slice(0, 300)}`);
    process.exit(1);
  });
}
