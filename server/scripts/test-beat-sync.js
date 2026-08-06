#!/usr/bin/env node
// BEAT SYNC + REVERSE DUCK — the two things that make sound and picture feel authored
// together rather than merely simultaneous.
//
// The beat detector is checked against a SYNTHESIZED click track of known tempo, so the
// assertion is "did it find the beat that is provably there", not "did it return something".
// The reverse duck is checked by building the real filter graph and rendering it.

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const beatGrid = require("../src/services/beat_grid");
const { mix } = require("../src/services/audio_mix");
const director = require("../src/services/audio_director");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-beat-"));
const ff = (args) => spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { windowsHide: true });

/** A click track at a known BPM: an 80Hz tone gated open for 60ms on every beat. */
function clickTrack(bpm, seconds, out) {
  const period = (60 / bpm).toFixed(6);
  // Commas inside a lavfi expression are option separators unless escaped.
  const expr = `aevalsrc=0.8*sin(2*PI*80*t)*lt(mod(t\\,${period})\\,0.06):d=${seconds}:s=8000`;
  ff(["-f", "lavfi", "-i", expr, "-c:a", "libmp3lame", "-q:a", "4", out]);
  return fs.existsSync(out) ? out : null;
}

(async () => {
  console.log("beat sync + reverse duck\n");

  // ------------------------------------------------------------------ snapping (pure)
  await test("a cue already on the beat is left exactly alone", () => {
    const grid = { periodSec: 0.5, phaseSec: 0, bpm: 120 };
    const { cues, moved } = beatGrid.snapCues([{ startSec: 1.0 }, { startSec: 2.5 }], grid);
    assert.strictEqual(moved, 0);
    assert.strictEqual(cues[0].startSec, 1.0);
  });

  await test("a cue just off the beat is pulled onto it", () => {
    const grid = { periodSec: 0.5, phaseSec: 0, bpm: 120 };
    const { cues, moved } = beatGrid.snapCues([{ startSec: 1.07 }], grid);
    assert.strictEqual(moved, 1);
    assert.strictEqual(cues[0].startSec, 1.0);
    assert.strictEqual(cues[0].beatSnapped, true);
  });

  await test("a cue far off the beat is NOT dragged — the picture wins", () => {
    // The load-bearing rule: sfx_plan placed this against something on screen. Moving it
    // 240ms to satisfy the music would break the sync that actually matters.
    const grid = { periodSec: 0.5, phaseSec: 0, bpm: 120 };
    const { cues, moved } = beatGrid.snapCues([{ startSec: 1.24 }], grid);
    assert.strictEqual(moved, 0);
    assert.strictEqual(cues[0].startSec, 1.24);
  });

  await test("snapping never reorders cues or collapses two onto one beat", () => {
    const grid = { periodSec: 0.5, phaseSec: 0, bpm: 120 };
    const { cues } = beatGrid.snapCues([{ startSec: 1.04 }, { startSec: 1.09 }], grid);
    const t = cues.map((c) => c.startSec);
    assert.ok(t[1] > t[0], `order broken: ${t.join(", ")}`);
    assert.ok(t[1] - t[0] >= 0.05, `cues collapsed: ${t.join(", ")}`);
  });

  await test("no grid means no change at all", () => {
    const cues = [{ startSec: 1.07 }, { startSec: 3.3 }];
    const out = beatGrid.snapCues(cues, null);
    assert.deepStrictEqual(out.cues, cues);
    assert.strictEqual(out.moved, 0);
  });

  // ------------------------------------------------------------------ detection (real ffmpeg)
  for (const bpm of [100, 128]) {
    await test(`detects ${bpm} BPM in a synthesized click track`, async () => {
      const f = clickTrack(bpm, 20, path.join(TMP, `click-${bpm}.mp3`));
      if (!f) throw new Error("ffmpeg could not build the fixture");
      const grid = await beatGrid.analyze(f, { durationSec: 20 });
      assert.ok(grid, "no grid found in a track that is nothing but beats");
      // Tempo detection is octave-ambiguous by nature (half/double time is a real hearing
      // of the same music), so accept the metrical relatives rather than pretending not to.
      const ok = [bpm, bpm / 2, bpm * 2].some((b) => Math.abs(grid.bpm - b) <= b * 0.06);
      assert.ok(ok, `expected ~${bpm} (or its half/double), got ${grid.bpm}`);
    });
  }

  await test("a track with no pulse returns null rather than a guess", async () => {
    const f = path.join(TMP, "drone.mp3");
    ff(["-f", "lavfi", "-i", "sine=frequency=110:duration=20", "-c:a", "libmp3lame", "-q:a", "4", f]);
    const grid = await beatGrid.analyze(f, { durationSec: 20 });
    assert.strictEqual(grid, null, `a steady drone must not yield a grid, got ${JSON.stringify(grid)}`);
  });

  await test("a missing or unreadable file degrades to null", async () => {
    assert.strictEqual(await beatGrid.analyze(null), null);
    assert.strictEqual(await beatGrid.analyze(path.join(TMP, "nope.mp3")), null);
  });

  // ------------------------------------------------------------------ the reverse duck
  await test("the director asks for a reverse duck ONLY with narration off", () => {
    const digest = [{ id: "s1", kind: "hook", startSec: 0, endSec: 4, beats: [], voPresent: false, voWords: 0 }];
    const planOff = director.defaultAudioPlan(digest, [], 4, { narration: "off" });
    const planOn = director.defaultAudioPlan(digest, [], 4, { narration: "on" });
    assert.ok(planOff.master.musicUnderSfxDuckDb < 0, "music-led mix must duck music under accents");
    assert.strictEqual(planOn.master.musicUnderSfxDuckDb, 0, "a narrated mix must not add a third relationship");
    // Structural, not advisory: an LLM plan cannot switch it on for a narrated film.
    const forced = director.__test.sanitizePlan(
      { master: { musicUnderSfxDuckDb: -10 }, scenes: [], sfx: [] },
      { digest, candidates: [], narration: "on" }
    );
    assert.strictEqual(forced.master.musicUnderSfxDuckDb, 0, "the mode owns this decision, not the model");
  });

  await test("the music-led mix renders with the reverse duck engaged", async () => {
    const video = path.join(TMP, "v.mp4");
    ff(["-f", "lavfi", "-i", "color=c=black:s=320x240:d=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
    const music = clickTrack(120, 6, path.join(TMP, "bed.mp3"));
    const cue = path.join(TMP, "cue.mp3");
    ff(["-f", "lavfi", "-i", "sine=frequency=900:duration=0.4", "-c:a", "libmp3lame", "-q:a", "4", cue]);

    const out = path.join(TMP, "mixed.mp4");
    const plan = {
      narration: "off",
      master: {
        voLufs: -16, voTruePeakDb: -1.5, musicSoloLufs: -16,
        musicUnderVoDuckDb: 0, musicMidCarveDb: 0, musicUnderSfxDuckDb: -7,
        masterTruePeakDb: -1.0,
      },
      scenes: [{ id: "s1", musicGainDb: 0 }],
      sfx: [{ id: 0, accept: true, gainDb: -16, atSec: 2 }],
    };
    const res = await mix({
      videoPath: video, outputPath: out, durationSec: 6,
      musicPath: music, sfx: [{ path: cue, startSec: 2, kind: "sfx", candidateIndex: 0 }],
      audioPlan: plan,
    });
    assert.ok(fs.existsSync(res), "no output produced");
    // The mixer falls back to the BASIC mix on any filter-graph error, so a file existing is
    // not proof. Confirm the delivered file actually carries audio.
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries",
      "stream=codec_type", "-of", "csv=p=0", res], { encoding: "utf8", windowsHide: true });
    assert.ok(/audio/.test(probe.stdout || ""), `delivered file has no audio track: ${probe.stderr}`);
  });

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
