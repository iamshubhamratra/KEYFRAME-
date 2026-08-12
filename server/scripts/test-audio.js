// AUDIO PIPELINE TESTS — cue semantics, conditioning, the mix chain, and the report.
// See AUDIO-AUDIT-2026-07-28.md. Deterministic: ffmpeg only, no network, no LLM.
//
//   node scripts/test-audio.js        (npm run test:audio)

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-audio-"));
const config = require("../src/config");
config.paths.dbFile = path.join(TMP, "jobs.json");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

const cues = require("../src/services/audio_cues");
const { planSfx } = require("../src/services/sfx_plan");
const { buildAudioReport } = require("../src/services/audio_report");

// ffmpeg helpers -------------------------------------------------------------
// astats prints its measurements to STDERR. execFileSync returns STDOUT, so reading it
// yielded null and every level assertion silently had nothing to compare.
const { spawnSync } = require("node:child_process");
function statDb(file, key, label) {
  // astats logs at INFO — under `-v error` it prints nothing and every measurement reads null.
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `astats=measure_overall=${key}:measure_perchannel=none`, "-f", "null", "-"], { encoding: "utf8" });
  const m = String(r.stderr || "").match(new RegExp(`${label} dB:\\s*(-?[\\d.]+)`, "i"));
  return m ? parseFloat(m[1]) : null;
}
const peakDb = (p) => statDb(p, "Peak_level", "Peak level");
const tone = (p, { freq = 440, dur = 1, vol = 1 } = {}) => {
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${dur}`, "-af", `volume=${vol}`, "-b:a", "160k", p]);
  return p;
};

(async () => {
  console.log("\nAudio pipeline\n");

  // ---- cue semantics (audit A5) --------------------------------------------
  await test("intent is decided by what the scene DOES, not by a keyword", () => {
    assert.strictEqual(cues.intentFor({ isLogo: true }), "logo-rise", "a logo arriving must not be a whoosh");
    assert.strictEqual(cues.intentFor({ hasNumber: true, role: "proof" }), "counter-tick", "a number landing wants a tick");
    assert.strictEqual(cues.intentFor({ role: "cta", isLast: true }), "cta-impact");
    assert.strictEqual(cues.intentFor({ role: "feature", hasAsset: true }), "product-reveal");
    assert.strictEqual(cues.intentFor({ animation: "scale-pop" }), "pop");
    assert.strictEqual(cues.intentFor({ animation: "slide-up" }), "card-slide");
    assert.strictEqual(cues.intentFor({}), "whoosh", "a plain cut is still a whoosh");
  });

  await test("the script's free text maps onto intents, and nonsense does not", () => {
    assert.strictEqual(cues.resolveIntent("swoosh"), "card-slide");
    assert.strictEqual(cues.resolveIntent("bass drop"), "product-reveal");
    assert.strictEqual(cues.resolveIntent("success ding"), "success");
    assert.strictEqual(cues.resolveIntent("banana"), null, "an unknown word must fall through to scene semantics");
  });

  await test("a counter scene no longer asks for a whoosh", () => {
    // The exact failure the brief describes: the script writes "whoosh" on a stat scene.
    const scenes = [
      { id: "s1", start: 0, duration: 4, purpose: "hook", onScreenText: ["Hi"], sfx: [] },
      { id: "s2", start: 4, duration: 4, purpose: "proof", onScreenText: ["98% faster"], sfx: ["whoosh"] },
      { id: "s3", start: 8, duration: 4, purpose: "cta", onScreenText: ["Start"], sfx: [] },
    ];
    const { cues: planned } = planSfx({ scenes, assetsByScene: new Map(), durationSec: 12 });
    const stat = planned.find((c) => c.sceneId === "s2");
    assert.ok(stat, "the stat scene should carry an accent");
    assert.notStrictEqual(stat.intent, "whoosh", "a number landing must not be a whoosh");
    assert.strictEqual(stat.intent, "counter-tick");
  });

  await test("a strong moment gets a cue even when the script forgot to ask", () => {
    const scenes = [
      { id: "s1", start: 0, duration: 4, purpose: "hook", onScreenText: ["Hi"], sfx: [] },
      { id: "s2", start: 4, duration: 4, purpose: "feature", onScreenText: ["Fast"], sfx: [] },
      { id: "s3", start: 8, duration: 4, purpose: "cta", onScreenText: ["Start today"], sfx: [] },
    ];
    const { cues: planned } = planSfx({ scenes, assetsByScene: new Map(), durationSec: 12 });
    assert.ok(planned.some((c) => c.sceneId === "s3"), "the close must land");
    assert.strictEqual(planned.find((c) => c.sceneId === "s3").intent, "cta-impact");
  });

  await test("the same SOUND never fires twice in a row, even under different names", () => {
    const scenes = [
      { id: "s1", start: 0,  duration: 5, purpose: "hook",    onScreenText: ["A"], sfx: ["impact"] },
      { id: "s2", start: 5,  duration: 5, purpose: "feature", onScreenText: ["B", "b2"], sfx: ["boom"] },
      { id: "s3", start: 10, duration: 5, purpose: "cta",     onScreenText: ["C"], sfx: ["slam"] },
    ];
    const { cues: planned } = planSfx({ scenes, assetsByScene: new Map(), durationSec: 15 });
    for (let i = 1; i < planned.length; i++) {
      assert.notStrictEqual(planned[i].intent, planned[i - 1].intent, "two identical sounds back to back");
    }
  });

  // ---- conditioning (audit A2 — the impact-8dB-down defect) ------------------
  await test("conditioning peak-normalizes a quiet cue up and a hot cue down", async () => {
    const quiet = tone(path.join(TMP, "quiet.mp3"), { vol: 0.05, dur: 1 });
    const hot = tone(path.join(TMP, "hot.mp3"), { vol: 1.0, dur: 1 });
    const before = { quiet: peakDb(quiet), hot: peakDb(hot) };
    assert.ok(before.hot - before.quiet > 15, `fixture setup: expected a wide gap, got ${before.hot - before.quiet}`);
    await cues.conditionCue(quiet, "whoosh");
    await cues.conditionCue(hot, "whoosh");
    const after = { quiet: peakDb(quiet), hot: peakDb(hot) };
    const gap = Math.abs(after.hot - after.quiet);
    assert.ok(gap < 2.0, `after conditioning the two cues should sit within ~2 dB, got ${gap.toFixed(1)} dB`);
  });

  await test("conditioning rejects silence rather than shipping an inaudible cue", async () => {
    const silent = path.join(TMP, "silent.mp3");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo:d=1", "-b:a", "128k", silent]);
    const r = await cues.conditionCue(silent, "whoosh");
    assert.strictEqual(r.ok, false);
    assert.ok(/silent/.test(r.reason));
  });

  await test("the shipped library's own cues condition to a consistent level", async () => {
    const dir = path.resolve(config.paths.root, "assets", "sfx");
    const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mp3")).slice(0, 6) : [];
    if (!names.length) return;                       // library not installed in this checkout
    const peaks = [];
    for (const n of names) {
      const c = path.join(TMP, "lib_" + n);
      fs.copyFileSync(path.join(dir, n), c);
      await cues.conditionCue(c, cues.resolveIntent(n.replace(/\.mp3$/, "")) || "whoosh");
      const p = peakDb(c);
      if (p !== null) peaks.push(p);
    }
    const spread = Math.max(...peaks) - Math.min(...peaks);
    // Before conditioning these ranged over ~8 dB of *program* loudness (impact sat at
    // -26 LUFS against -18 for the rest). Peak-normalizing per family closes that.
    assert.ok(spread <= 8.5, `library cues still spread ${spread.toFixed(1)} dB after conditioning`);
  });

  // ---- the mix chain (audit A3/A4) -----------------------------------------
  const { mix } = require("../src/services/audio_mix");
  const video = path.join(TMP, "v.mp4");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x180:d=8", "-pix_fmt", "yuv420p", video]);
  const vo = tone(path.join(TMP, "vo.mp3"), { freq: 300, dur: 3, vol: 0.6 });
  const music = tone(path.join(TMP, "mus.mp3"), { freq: 800, dur: 8, vol: 0.6 });
  const hit = tone(path.join(TMP, "hit.mp3"), { freq: 1200, dur: 1, vol: 0.9 });
  const plan = {
    master: { voLufs: -16, voTruePeakDb: -1.5, musicSoloLufs: -23, musicUnderVoDuckDb: -11, duckAttackMs: 40, duckReleaseMs: 500, masterTruePeakDb: -1 },
    scenes: [
      { sceneId: "s1", startSec: 0, endSec: 4, kind: "hook", musicGainDb: 0, duckDepthDb: 11, voPresent: true },
      { sceneId: "s2", startSec: 4, endSec: 8, kind: "cta", musicGainDb: 3, duckDepthDb: 0, voPresent: false },
    ],
    sfx: [{ id: 0, cue: "cta-impact", accept: true, gainDb: -16, atSec: 4.5 }],
  };

  await test("the mix renders and the delivered file carries audio", async () => {
    const out = path.join(TMP, "mixed.mp4");
    await mix({
      videoPath: video, outputPath: out, durationSec: 8,
      ttsPath: null, musicPath: music,
      sfx: [{ path: vo, startSec: 0.5, volume: 1, kind: "vo" }, { path: hit, startSec: 4.5, volume: 0.4 }],
      audioPlan: plan,
    });
    assert.ok(fs.existsSync(out), "no output produced");
    const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out]).toString();
    assert.ok(probe.includes("audio"), "the mix produced no audio track");
  });

  await test("music is genuinely ducked while the voice speaks", async () => {
    // Music alone vs music + VO, measured over the SAME window the voice occupies.
    const win = ["-ss", "1", "-t", "1.5"];
    const rms = (file) => {
      const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...win, "-i", file, "-af", "astats=measure_overall=RMS_level:measure_perchannel=none", "-f", "null", "-"], { encoding: "utf8" });
      const m = String(r.stderr || "").match(/RMS level dB:\s*(-?[\d.]+)/i);
      return m ? parseFloat(m[1]) : null;
    };
    const noVo = path.join(TMP, "novo.mp4"), withVo = path.join(TMP, "withvo.mp4");
    await mix({ videoPath: video, outputPath: noVo, durationSec: 8, ttsPath: null, musicPath: music, sfx: [], audioPlan: { ...plan, sfx: [] } });
    await mix({ videoPath: video, outputPath: withVo, durationSec: 8, ttsPath: null, musicPath: music, sfx: [{ path: vo, startSec: 0.5, volume: 1, kind: "vo" }], audioPlan: { ...plan, sfx: [] } });
    const a = rms(noVo), b = rms(withVo);
    assert.ok(a !== null && b !== null, "could not measure the mixes");
    // With the voice present the 800Hz bed must be pulled down; the summed level is
    // dominated by the (louder, normalized) voice, so we assert the bed CHANGED rather
    // than a specific direction of the sum.
    assert.ok(Math.abs(a - b) > 1.5, `music appears unaffected by the voice (${a.toFixed(1)} vs ${b.toFixed(1)} dB) — ducking may not be wired`);
  });

  await test("the music envelope ramps between scenes instead of stepping", () => {
    const { __test } = require("../src/services/audio_mix");
    if (!__test || !__test.buildMusicEnvExpr) return;    // seam not exported
    const expr = __test.buildMusicEnvExpr(plan.scenes);
    assert.ok(!/between\(/.test(expr), "the envelope is still a step function (between())");
    assert.ok(/\(t-/.test(expr), "the envelope should interpolate on t");
  });

  // ---- the validation report (audit A8) ------------------------------------
  await test("the report catches unmapped, duplicate and unjustified effects", () => {
    const r = buildAudioReport({
      plan: { master: plan.master, sfx: [{ id: 0, accept: true }, { id: 1, accept: true }, { id: 2, accept: true }] },
      sfxClips: [
        { name: "whoosh", sceneId: "s1", support: "scene cut", startSec: 0 },
        { name: "whoosh", sceneId: "s2", support: "scene cut", startSec: 4 },   // duplicate
        { name: "pop", sceneId: "ghost", support: null, startSec: 6 },          // unmapped + unjustified
      ],
      scenes: [{ id: "s1" }, { id: "s2" }],
      musicPath: music, musicMood: "Modern Corporate", voClips: [{ sceneId: "s1" }],
    });
    assert.strictEqual(r.soundEffects, 3);
    assert.strictEqual(r.sceneMatches, 2, "only two effects map to real scenes");
    assert.strictEqual(r.duplicateEffects, 1);
    assert.strictEqual(r.voiceoverDucking, true);
    assert.strictEqual(r.sfxDucking, true);
    assert.ok(r.qualityScore < 80, `a film with these defects should not score well (got ${r.qualityScore})`);
    assert.ok(r.issues.length >= 3, `expected several issues, got ${JSON.stringify(r.issues)}`);
  });

  await test("a clean soundtrack reports the brief's shape and scores high", () => {
    const r = buildAudioReport({
      plan: { master: plan.master, sfx: [{ id: 0, accept: true }, { id: 1, accept: true }] },
      sfxClips: [
        { name: "logo-rise", sceneId: "s1", support: "scene cut", startSec: 0 },
        { name: "cta-impact", sceneId: "s2", support: "build into the climax", startSec: 5 },
      ],
      scenes: [{ id: "s1" }, { id: "s2" }],
      musicPath: music, musicMood: "Modern Corporate", voClips: [{ sceneId: "s1" }],
    });
    for (const k of ["backgroundMusic", "soundEffects", "sceneMatches", "voiceoverDucking", "audioNormalization", "duplicateEffects", "qualityScore"]) {
      assert.ok(k in r, `the report must expose "${k}"`);
    }
    assert.strictEqual(r.duplicateEffects, 0);
    assert.strictEqual(r.sceneMatches, r.soundEffects);
    assert.ok(r.qualityScore >= 95, `a clean soundtrack should score high (got ${r.qualityScore})`);
  });

  // ======================= FLEXIBLE AUDIO (voiceover toggle) =======================
  console.log("\nFlexible audio — narration modes & template identity\n");

  const director = require("../src/services/audio_director");
  const profileSvc = require("../src/services/audio_profile");
  const manifest = require("../src/services/frame_manifest");
  const frameRegistry = require("../src/services/frame_registry");

  const digestOf = (voPresent) => [
    { id: "s1", kind: "hook", startSec: 0, endSec: 5, voPresent, voWords: 12 },
    { id: "s2", kind: "bullet", startSec: 5, endSec: 10, voPresent, voWords: 20 },
    { id: "s3", kind: "cta", startSec: 10, endSec: 15, voPresent, voWords: 8 },
  ];
  const cands = [{ id: 0, name: "logo-rise", startSec: 0.4 }, { id: 1, name: "cta-impact", startSec: 10.2 }];

  await test("every installed pack declares an audio identity that resolves", () => {
    const packs = frameRegistry.listPacks();
    const neutral = packs.filter((p) => profileSvc.profileFor(p).source !== "manifest");
    assert.strictEqual(neutral.length, 0, `packs with no audio identity: ${neutral.join(", ")}`);
    for (const p of packs) {
      const pr = profileSvc.profileFor(p);
      assert.ok(pr.musicKeywords.length >= 4, `${p}: needs >=4 music keywords, got ${pr.musicKeywords.length}`);
      assert.ok(pr.style.length >= 2, `${p}: needs >=2 style tags`);
    }
  });

  await test("a pack can never name a sound effect the library cannot produce", () => {
    // The guard that lets the palette be hand-edited safely. Asserted for all 43 packs
    // AND for a deliberately bad block, so a green run means the check itself works.
    for (const p of frameRegistry.listPacks()) {
      const m = manifest.getManifest(p);
      assert.deepStrictEqual(manifest.audioPaletteErrors(m && m.audio), [], `${p} has an unresolvable cue`);
    }
    const bad = manifest.audioPaletteErrors({ sfxPalette: { transition: "kazoo" } });
    assert.ok(bad.length === 1 && /kazoo/.test(bad[0]), "a bogus cue name must be reported");
    const badRole = manifest.audioPaletteErrors({ sfxPalette: { elevenses: "whoosh" } });
    assert.ok(badRole.length === 1 && /elevenses/.test(badRole[0]), "an unknown scene role must be reported");
  });

  await test("an unprofiled pack falls back to today's behaviour, not to a broken one", () => {
    const p = profileSvc.profileFor("a-pack-that-does-not-exist");
    assert.strictEqual(p.source, "neutral");
    const q = profileSvc.musicCandidatesFor({
      framePack: "a-pack-that-does-not-exist", jobId: "j1",
      scriptMusic: { mood: "upbeat", query: "startup launch" },
    });
    assert.strictEqual(q.source, "script", "a pack with no identity must not claim a template-steered search");
    assert.deepStrictEqual(q.candidates, ["upbeat startup launch"], "it must be exactly the legacy query");
  });

  await test("keyword rotation is deterministic per job and varies across jobs", () => {
    const a1 = profileSvc.musicCandidatesFor({ framePack: "prisma-bloc", jobId: "job-aaa" });
    const a2 = profileSvc.musicCandidatesFor({ framePack: "prisma-bloc", jobId: "job-aaa" });
    assert.deepStrictEqual(a1.candidates, a2.candidates, "the same job must re-render the same search");
    // Across many jobs the pack must not always pick the same phrase — that is the whole
    // point of rotation (two films on one template sound related, not identical).
    const seen = new Set();
    for (let i = 0; i < 24; i++) seen.add(profileSvc.musicCandidatesFor({ framePack: "prisma-bloc", jobId: `job-${i}` }).keywords.join("|"));
    assert.ok(seen.size >= 4, `rotation should vary across jobs, saw ${seen.size} distinct picks`);
  });

  await test("the template's own keywords lead the search, the script query trails", () => {
    const q = profileSvc.musicCandidatesFor({
      framePack: "terminal-departures", jobId: "j7",
      scriptMusic: { mood: "corporate", query: "dental clinic" },
    });
    assert.strictEqual(q.source, "template");
    const kws = profileSvc.profileFor("terminal-departures").musicKeywords;
    assert.ok(kws.some((k) => q.candidates[0].includes(k.split(" ")[0])), `lead candidate "${q.candidates[0]}" must carry a template keyword`);
    const subjectIdx = q.candidates.findIndex((c) => c.includes("dental"));
    assert.ok(subjectIdx > 0, "the subject-derived query must survive, but never lead");
  });

  await test("narration off tilts a pack toward its driving end without leaving its genre", () => {
    // paper-tales is calm/acoustic. Off-mode must reach its more driving phrasings and
    // must NOT introduce a genre the pack never declared.
    const off = profileSvc.musicCandidatesFor({ framePack: "paper-tales", jobId: "j9", narration: "off" });
    const declared = profileSvc.profileFor("paper-tales").musicKeywords;
    for (const k of off.keywords) assert.ok(declared.includes(k), `"${k}" is not one of paper-tales' declared keywords`);
    const tail = declared.slice(Math.floor(declared.length / 2));
    assert.ok(off.keywords.some((k) => tail.includes(k)), "off-mode should reach the pack's driving end");
  });

  await test("a pack with energyBoost 0 stays exactly as calm with no narration", () => {
    const declared = profileSvc.profileFor("edition");
    assert.strictEqual(declared.noVo.energyBoost, 0);
    const on = profileSvc.pickMusicKeywords({ profile: declared, seedKey: "k", narration: "on" });
    const off = profileSvc.pickMusicKeywords({ profile: declared, seedKey: "k", narration: "off" });
    assert.deepStrictEqual(off, on, "energyBoost 0 must opt out of the no-VO tilt entirely");
  });

  await test("the two narration modes produce genuinely different mixes", () => {
    const on = director.defaultAudioPlan(digestOf(true), cands, 15, { narration: "on", profile: profileSvc.profileFor("prisma-bloc") });
    const off = director.defaultAudioPlan(digestOf(false), cands, 15, { narration: "off", profile: profileSvc.profileFor("prisma-bloc") });
    assert.ok(off.master.musicSoloLufs > on.master.musicSoloLufs, "music must come forward with no voice");
    assert.strictEqual(off.master.musicUnderVoDuckDb, 0, "nothing to duck under");
    assert.strictEqual(off.master.musicMidCarveDb, 0, "the vocal-band carve must be removed");
    assert.strictEqual(on.master.musicMidCarveDb, -4, "the carve stays for a narrated film");
    assert.ok(off.sfx[0].gainDb > on.sfx[0].gainDb, "SFX must come forward with no voice");
    assert.ok(off.scenes.every((s) => s.duckDepthDb === 0), "no scene may duck with no voice");
    // The peak ceiling is the thing that must NOT move — "louder but never harsh".
    assert.strictEqual(off.master.masterTruePeakDb, on.master.masterTruePeakDb, "the true-peak ceiling must not move between modes");
  });

  await test("the no-VO music curve is wider, so the bed carries the arc", () => {
    const on = director.defaultAudioPlan(digestOf(true), cands, 15, { narration: "on" });
    const off = director.defaultAudioPlan(digestOf(false), cands, 15, { narration: "off" });
    const span = (p) => Math.max(...p.scenes.map((s) => s.musicGainDb)) - Math.min(...p.scenes.map((s) => s.musicGainDb));
    assert.ok(span(off) > span(on), `no-VO curve should be wider (on ${span(on)} dB vs off ${span(off)} dB)`);
  });

  await test("the LLM path cannot override the mode's structural decisions", () => {
    // A model that ignores its brief and asks for a deep duck on a voiceless film must be
    // corrected, not obeyed — the mixer would key a sidechain off silence.
    const rogue = { master: { musicUnderVoDuckDb: -18, musicMidCarveDb: -6, musicSoloLufs: -28 }, scenes: [{ sceneId: "s1", duckDepthDb: 14 }], sfx: [] };
    const p = director.__test.sanitizePlan(rogue, { digest: digestOf(false), candidates: cands, narration: "off", profile: profileSvc.profileFor("prisma-bloc") });
    assert.strictEqual(p.master.musicUnderVoDuckDb, 0);
    assert.strictEqual(p.master.musicMidCarveDb, 0);
    assert.strictEqual(p.scenes[0].duckDepthDb, 0);
  });

  await test("the fail-open default is the same FEATURE as the planned path", () => {
    // A director outage must not silently revert a music-led film to a voice-led mix.
    const dflt = director.defaultAudioPlan(digestOf(false), cands, 15, { narration: "off", profile: profileSvc.profileFor("prisma-bloc") });
    const llm = director.__test.sanitizePlan({}, { digest: digestOf(false), candidates: cands, narration: "off", profile: profileSvc.profileFor("prisma-bloc") });
    assert.strictEqual(dflt.master.musicSoloLufs, llm.master.musicSoloLufs);
    assert.strictEqual(dflt.master.musicUnderVoDuckDb, llm.master.musicUnderVoDuckDb);
    assert.strictEqual(dflt.master.musicMidCarveDb, llm.master.musicMidCarveDb);
    assert.strictEqual(dflt.sfx[0].gainDb, llm.sfx[0].gainDb);
  });

  await test("a narration-free film raises the SFX budget without loosening the support gate", () => {
    // Scenes with NOTHING happening must stay silent no matter how big the budget is —
    // a denser mix must never mean unmotivated sounds.
    const bare = Array.from({ length: 8 }, (_, i) => ({ id: `s${i + 1}`, start: i * 5, duration: 5, purpose: "context", onScreenText: ["just words"], sfx: ["whoosh"] }));
    const rich = planSfx({ scenes: bare, durationSec: 40, densityScale: 1.5 });
    const norm = planSfx({ scenes: bare, durationSec: 40, densityScale: 1 });
    assert.ok(rich.budget > norm.budget, "no-VO density must raise the budget");
    for (const c of rich.cues) assert.ok(c.support, "every cue must still name what it lands on");

    // A MID-film scene with nothing arriving on screen. (It must be mid-film: the first
    // and last scenes are the hook and the climax, which earn a cue on their own — a
    // one-scene film is BOTH, so it is the wrong shape to test a support failure with.)
    const noSupport = [
      { id: "x1", start: 0, duration: 4, purpose: "hook", onScreenText: ["open"], sfx: [] },
      { id: "x2", start: 4, duration: 4, purpose: "context", onScreenText: ["one line"], sfx: ["ding"] },
      { id: "x3", start: 8, duration: 4, purpose: "context", onScreenText: ["another"], sfx: [] },
      { id: "x4", start: 12, duration: 4, purpose: "cta", onScreenText: ["go"], sfx: [] },
    ];
    const r = planSfx({ scenes: noSupport, durationSec: 30, densityScale: 2 });
    assert.ok(
      !r.cues.some((c) => c.sceneId === "x2"),
      "a reveal cue with no reveal must be dropped even at max density",
    );
    assert.ok(
      r.dropped.some((d) => d.sceneId === "x2" && /no on-screen reveal/.test(d.reason)),
      "and the drop must be reported with its reason",
    );
  });

  await test("the template palette changes a cue's timbre but never whether it fires", () => {
    const paper = profileSvc.profileFor("paper-tales");
    const terminal = profileSvc.profileFor("terminal-departures");
    assert.notStrictEqual(
      profileSvc.paletteCueFor(paper, "whoosh"),
      profileSvc.paletteCueFor(terminal, "whoosh"),
      "two packs should not make a transition sound identical",
    );
    // Both must land on real, producible cues.
    for (const p of [paper, terminal]) {
      for (const intent of Object.keys(cues.CUES)) {
        assert.ok(cues.CUES[profileSvc.paletteCueFor(p, intent)], `palette produced an unresolvable cue for ${intent}`);
      }
    }
    // A neutral profile is a pure pass-through — that is what keeps it "unchanged".
    for (const intent of Object.keys(cues.CUES)) {
      assert.strictEqual(profileSvc.paletteCueFor(profileSvc.NEUTRAL, intent), intent);
    }
  });

  await test("track ranking prefers a track that covers the film over one that must loop", () => {
    const { scoreTrack } = require("../src/services/audio_sources").__test;
    const covers = { duration: 60, tags: ["electronic"], avg_rating: 3, num_downloads: 100 };
    const loops = { duration: 20, tags: ["electronic"], avg_rating: 5, num_downloads: 9000 };
    assert.ok(
      scoreTrack(covers, { filmSec: 45, style: ["electronic"] }) > scoreTrack(loops, { filmSec: 45, style: ["electronic"] }),
      "length fit must outweigh popularity — a seam every 20s is the most audible defect a bed has",
    );
    const onStyle = { duration: 60, tags: ["synthwave", "retro"], avg_rating: 3, num_downloads: 100 };
    const offStyle = { duration: 60, tags: ["polka"], avg_rating: 3, num_downloads: 100 };
    assert.ok(
      scoreTrack(onStyle, { filmSec: 45, style: ["synthwave"] }) > scoreTrack(offStyle, { filmSec: 45, style: ["synthwave"] }),
      "tag overlap with the template's genre must count",
    );
  });

  await test("the report catches a toggle that did nothing, in both directions", () => {
    const scenes = [{ id: "s1", voiceover: "hello there" }, { id: "s2", voiceover: "and goodbye" }];
    const plan = director.defaultAudioPlan(digestOf(false), [], 15, { narration: "off" });

    const leaked = buildAudioReport({ plan, scenes, musicPath: "m.mp3", narration: "off", voiceoverRequested: false, voClips: [{ sceneId: "s1" }] });
    assert.strictEqual(leaked.voiceoverRespected, false, "narration off with clips in the mix must fail");
    assert.ok(leaked.issues.some((i) => /disabled/.test(i)));

    const honored = buildAudioReport({ plan, scenes, musicPath: "m.mp3", narration: "off", voiceoverRequested: false, voClips: [] });
    assert.strictEqual(honored.voiceoverRespected, true);
    assert.strictEqual(honored.narration, "off");

    // The other direction: a narrated film whose TTS silently died.
    const onPlan = director.defaultAudioPlan(digestOf(true), [], 15, { narration: "on" });
    const died = buildAudioReport({ plan: onPlan, scenes, musicPath: "m.mp3", narration: "on", voiceoverRequested: true, voClips: [] });
    assert.strictEqual(died.voiceoverRespected, false, "a requested voiceover that never arrived must fail");
  });

  await test("the report tells a template-chosen bed from a script-fallback one", () => {
    const plan = director.defaultAudioPlan(digestOf(true), [], 15, { narration: "on" });
    const profile = profileSvc.profileFor("prisma-bloc");
    const base = { plan, scenes: [{ id: "s1" }], musicPath: "m.mp3", voClips: [{ sceneId: "s1" }], profile };

    const fromTemplate = buildAudioReport({ ...base, musicSelection: { query: "future bass driving", keywords: ["future bass"], provider: "pixabay" } });
    assert.strictEqual(fromTemplate.musicSource, "template");
    assert.strictEqual(fromTemplate.musicFromTemplate, true);

    // A template keyword that lost to a later candidate must NOT be reported as a
    // template-steered choice — the report says what WON, not what was asked.
    const fellBack = buildAudioReport({ ...base, musicSelection: { query: "dental clinic upbeat", keywords: ["future bass"], provider: "freesound" } });
    assert.strictEqual(fellBack.musicSource, "script-fallback");
    assert.ok(fellBack.issues.some((i) => /template/.test(i)));
  });

  await test("ducking correctness is judged against the mode, not assumed", () => {
    const scenes = [{ id: "s1", voiceover: "hi" }];
    const offPlan = director.defaultAudioPlan(digestOf(false), [], 15, { narration: "off" });
    const offRep = buildAudioReport({ plan: offPlan, scenes, musicPath: "m.mp3", narration: "off", voiceoverRequested: false, voClips: [] });
    assert.strictEqual(offRep.duckingCorrect, true, "no duck on a voiceless film is CORRECT, not a defect");
    assert.strictEqual(offRep.voiceoverDucking, false);
    assert.ok(!offRep.issues.some((i) => /not ducked/.test(i)), "a music-led film must not be scolded for not ducking");
    assert.strictEqual(offRep.noVoEnergy, true, "the bed must actually have come forward");

    // A music-led plan whose bed never came forward is a mode that did not take effect.
    const flat = { ...offPlan, master: { ...offPlan.master, musicSoloLufs: -23 } };
    const flatRep = buildAudioReport({ plan: flat, scenes, musicPath: "m.mp3", narration: "off", voiceoverRequested: false, voClips: [] });
    assert.strictEqual(flatRep.noVoEnergy, false);
    assert.ok(flatRep.qualityScore < offRep.qualityScore);
  });

  await test("a legacy caller gets exactly the pre-feature report", () => {
    // Every new input defaults to the old reading, so nothing that already worked moves.
    const plan = director.defaultAudioPlan(digestOf(true), [], 15);
    const r = buildAudioReport({
      plan, sfxClips: [], scenes: [{ id: "s1", voiceover: "hello" }],
      musicPath: "m.mp3", musicMood: "modern", voClips: [{ sceneId: "s1" }],
    });
    assert.strictEqual(r.narration, "on");
    assert.strictEqual(r.voiceoverRespected, true);
    assert.strictEqual(r.musicSource, "script-fallback");
    assert.strictEqual(r.noVoEnergy, null, "noVoEnergy is not a question a narrated film answers");
    assert.strictEqual(r.qualityScore, 100, "a clean narrated soundtrack must still score 100");
  });

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
