// Video quality — the medium nothing used to look at.
//
// Three gaps these pin, all found by the spec audit:
//   1. a fetched clip passed one test (>5KB + a decodable stream) — no resolution floor,
//      no length, no frame rate;
//   2. video was excluded from the dedupe pass, so it was the ONLY asset type with no
//      duplicate detection at all;
//   3. nothing ever ffprobed the DELIVERED file, so a film could ship at the wrong
//      resolution, cut short, or silent after a voiceover was synthesised, and every check
//      still read green — because every check ran on the plan, never on the artifact.
//
// Pure + fast: the ffprobe-backed cases run only if a real MP4 is lying around, and say so
// when they skip rather than passing silently.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const vp = require("../src/services/video_probe");
const quality = require("../src/services/asset_quality");
const { assessDelivery } = require("../src/services/delivery_quality");

let pass = 0, fail = 0, skip = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}
async function ta(name, fn) {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}
function skipped(name, why) { console.log(`  skip ${name} — ${why}`); skip++; }

// ---------------------------------------------------------------- parseRate
t("RATE: ffprobe's rational frame rates parse, and the degenerate ones become null", () => {
  assert.strictEqual(vp.parseRate("30/1"), 30);
  assert.ok(Math.abs(vp.parseRate("30000/1001") - 29.97) < 0.01);
  assert.strictEqual(vp.parseRate("25"), 25);
  // 0/0 is a real answer from real files and must not become 0, NaN or Infinity.
  assert.strictEqual(vp.parseRate("0/0"), null);
  assert.strictEqual(vp.parseRate(""), null);
  assert.strictEqual(vp.parseRate(null), null);
});

// ---------------------------------------------------------------- gradeClip (input side)
const probeOf = (o) => ({ ok: true, error: null, longEdge: Math.max(o.width, o.height), ...o });

t("CLIP FLOOR: a clip below the resolution floor is rejected", () => {
  const g = vp.gradeClip(probeOf({ width: 320, height: 180, durationSec: 8 }));
  assert.strictEqual(g.ok, false);
  assert.ok(/long edge/.test(g.reasons.join(" ")), g.reasons.join("; "));
});

t("CLIP FLOOR: a clip too short to hold a beat is rejected", () => {
  const g = vp.gradeClip(probeOf({ width: 1920, height: 1080, durationSec: 0.4 }));
  assert.strictEqual(g.ok, false);
  assert.ok(/too short/.test(g.reasons.join(" ")), g.reasons.join("; "));
});

t("CLIP FLOOR: a normal stock clip passes", () => {
  assert.strictEqual(vp.gradeClip(probeOf({ width: 1920, height: 1080, durationSec: 12 })).ok, true);
});

t("CLIP FLOOR: UNKNOWN IS NOT BAD — a missing duration never rejects", () => {
  // Stock WebM routinely reports no duration. Rejecting on absent evidence would starve
  // the film of footage for a fact we never established.
  const g = vp.gradeClip(probeOf({ width: 1920, height: 1080, durationSec: null }));
  assert.strictEqual(g.ok, true, g.reasons.join("; "));
});

t("CLIP FLOOR: an unreadable probe is reported, not crashed on", () => {
  assert.strictEqual(vp.gradeClip(null).ok, false);
  assert.strictEqual(vp.gradeClip({ ok: false, error: "not decodable" }).ok, false);
});

// ---------------------------------------------------------------- checkDelivery (output side)
const delivered = (o = {}) => ({
  ok: true, width: 1080, height: 1920, durationSec: 30, fps: 30,
  bitrateKbps: 2500, pixels: 1080 * 1920, hasAudio: true, ...o,
});
const want = { width: 1080, height: 1920, fps: 30, durationSec: 30, expectAudio: true };

t("DELIVERY: a film that matches its plan reports nothing", () => {
  assert.deepStrictEqual(vp.checkDelivery(delivered(), want), []);
});

t("DELIVERY: the wrong resolution is caught", () => {
  const is = vp.checkDelivery(delivered({ width: 720, height: 1280 }), want);
  assert.strictEqual(is.length, 1);
  assert.strictEqual(is[0].severity, "major");
  assert.ok(/720x1280/.test(is[0].detail) && /1080x1920/.test(is[0].detail), is[0].detail);
});

t("DELIVERY: a film cut short is caught, and a badly truncated one blocks", () => {
  const mild = vp.checkDelivery(delivered({ durationSec: 25 }), want);
  assert.strictEqual(mild.length, 1);
  assert.strictEqual(mild[0].severity, "major");

  const severe = vp.checkDelivery(delivered({ durationSec: 9 }), want);
  assert.strictEqual(severe[0].severity, "blocker", "losing two thirds of the film is a blocker");
});

t("DELIVERY: container rounding is not a finding", () => {
  // The mix trims to the visual and MP4 duration rounds; a frame or two must stay silent.
  assert.deepStrictEqual(vp.checkDelivery(delivered({ durationSec: 30.4 }), want), []);
  assert.deepStrictEqual(vp.checkDelivery(delivered({ durationSec: 29.2 }), want), []);
});

t("DELIVERY: THE SILENT FILM — audio was prepared and did not reach the container", () => {
  const is = vp.checkDelivery(delivered({ hasAudio: false }), want);
  assert.strictEqual(is.length, 1);
  assert.strictEqual(is[0].severity, "blocker");
  assert.ok(/no audio track/i.test(is[0].detail), is[0].detail);
});

t("DELIVERY: a film that never asked for audio is not accused of being silent", () => {
  assert.deepStrictEqual(
    vp.checkDelivery(delivered({ hasAudio: false }), { ...want, expectAudio: false }), []);
});

t("DELIVERY: an undecodable delivery blocks and suppresses the noise behind it", () => {
  const is = vp.checkDelivery({ ok: false, error: "not decodable" }, want);
  assert.strictEqual(is.length, 1, "one clear blocker, not five derived complaints");
  assert.strictEqual(is[0].severity, "blocker");
});

t("DELIVERY: absent expectations produce no findings", () => {
  // A pipeline that does not know what it asked for must not invent a verdict.
  assert.deepStrictEqual(vp.checkDelivery(delivered(), {}), []);
  assert.deepStrictEqual(vp.checkDelivery(null, want), []);
});

t("DELIVERY: a collapsed bitrate is noticed", () => {
  const is = vp.checkDelivery(delivered({ bitrateKbps: 90 }), want);
  assert.ok(is.some((i) => /bitrate/i.test(i.detail)), JSON.stringify(is));
});

// ---------------------------------------------------------------- the panel
t("PANEL: delivery findings reach the user-facing verdict", () => {
  const probe = { ...delivered({ hasAudio: false }), issues: vp.checkDelivery(delivered({ hasAudio: false }), want) };
  const a = assessDelivery({ status: "done", video_url: "/videos/x.mp4", delivery_probe: probe });
  assert.ok(a.issues.some((i) => i.area === "delivery"), "the silent film must appear in the panel");
  assert.strictEqual(a.counts.blockers >= 1, true);
  assert.ok(a.signals.delivered === null || typeof a.signals.delivered === "object");
});

t("PANEL: a clean delivery adds nothing and still reports the numbers", () => {
  const probe = { ...delivered(), issues: [] };
  const a = assessDelivery({ status: "done", video_url: "/videos/x.mp4", delivery_probe: probe });
  assert.strictEqual(a.issues.filter((i) => i.area === "delivery").length, 0);
  assert.ok(a.signals.delivered && a.signals.delivered.width === 1080, JSON.stringify(a.signals.delivered));
});

t("PANEL: a job with no probe is unchanged (fail-open)", () => {
  const a = assessDelivery({ status: "done", video_url: "/videos/x.mp4" });
  assert.ok(a && typeof a.score === "number");
  assert.strictEqual(a.issues.filter((i) => i.area === "delivery").length, 0);
});

// ---------------------------------------------------------------- scoring
const clip = (o) => ({ path: "x.mp4", type: "video", source: "stock", ...o });
const FRAME = { width: 1920, height: 1080 };
const sc = (o) => quality.scoreAsset(clip(o), { frame: FRAME }).score;

t("SCORE: footage is graded on footage evidence, not on neutral defaults", () => {
  const good = quality.scoreAsset(clip({ width: 1920, height: 1080, clipDurationSec: 6, fps: 30, bitrateKbps: 4000 }), { frame: FRAME });
  assert.strictEqual(good.kind, "video");
  assert.ok(good.score >= 78, `a clean 1080p clip should grade hero, got ${good.score}`);
  assert.ok(good.parts && good.parts.resolution != null && good.parts.duration != null);
});

t("SCORE: a scrap ranks BELOW a merely-thin clip (the density inversion)", () => {
  // Bitrate per megapixel RISES as the frame shrinks. Scored as a reward it made the
  // smallest clip the best one; this pins the ordering that exposed it.
  const scrap = sc({ width: 320, height: 180, clipDurationSec: 1, fps: 12, bitrateKbps: 80 });
  const thin  = sc({ width: 640, height: 360, clipDurationSec: 2, fps: 15, bitrateKbps: 200 });
  assert.ok(scrap < thin, `scrap ${scrap} must rank below thin ${thin}`);
});

t("SCORE: a smeared 1080p clip cannot grade hero on frame size alone", () => {
  const smeared = sc({ width: 1920, height: 1080, clipDurationSec: 8, fps: 30, bitrateKbps: 120 });
  const clean   = sc({ width: 1920, height: 1080, clipDurationSec: 8, fps: 30, bitrateKbps: 4000 });
  assert.ok(smeared < clean, `smeared ${smeared} must rank below clean ${clean}`);
  assert.ok(smeared < 78, `a visibly smeared clip must not grade hero (got ${smeared})`);
});

t("SCORE: an unprobed clip stays neutral rather than being punished", () => {
  const r = quality.scoreAsset(clip({}), { frame: FRAME });
  assert.strictEqual(r.score, 60, `unknown must be neutral, got ${r.score}`);
  assert.strictEqual(r.grade, "medium");
});

t("SCORE: resolution is judged against the FRAME, so a portrait film is not punished", () => {
  const a = { width: 1080, height: 1920, clipDurationSec: 6, fps: 30, bitrateKbps: 3000 };
  const portrait = quality.scoreAsset(clip(a), { frame: { width: 1080, height: 1920 } }).score;
  assert.ok(portrait >= 78, `a native-portrait clip in a portrait film should grade hero, got ${portrait}`);
});

// ------------------------------------------------ regressions found by adversarial review
//
// Every case below is a defect the first cut of this change actually had. They are the
// reason the review was worth running, and they are pinned so they cannot come back.

t("REVIEW: a host with no ffprobe must not report a perfect film as broken", () => {
  // `unavailable` separates "we could not run the check" from "the file is bad". Without it
  // a missing binary blockered every delivery on that host.
  const is = vp.checkDelivery({ ok: false, unavailable: true, error: "ffprobe unavailable (ENOENT)" }, want);
  assert.deepStrictEqual(is, [], "an absent prober says nothing about the film");
  // a genuinely undecodable FILE is still a blocker
  assert.strictEqual(vp.checkDelivery({ ok: false, error: "not decodable" }, want)[0].severity, "blocker");
});

t("REVIEW: a container reporting duration 0 means UNKNOWN, not zero-length", () => {
  // A fragmented MP4 / stream-copied remux writes "0.000000". `!= null` read that as fact.
  assert.strictEqual(vp.gradeClip(probeOf({ width: 1920, height: 1080, durationSec: 0 })).ok, true,
    "a clip whose container does not know its length must not be rejected for it");
  assert.deepStrictEqual(vp.checkDelivery(delivered({ durationSec: 0 }), want), [],
    "and the delivered film must not be reported as cut short");
});

t("REVIEW: a correct music-led film that ended up silent is not blamed on the mix", () => {
  // expectAudio now asserts what was MIXED, not what was REQUESTED. A job can ask for music,
  // have every provider fail, and deliver a correct silent film.
  assert.deepStrictEqual(
    vp.checkDelivery(delivered({ hasAudio: false }), { ...want, expectAudio: false }), [],
    "nothing was mixed, so nothing is missing");
});

t("REVIEW: resolution is orientation-aware — a landscape clip does not fill a portrait frame", () => {
  // Long-edge-to-long-edge scored a 1920x1080 clip a perfect 1.0 in a 1080x1920 film, when
  // cover-fitting it actually means scaling its 1080 height up to 1920.
  const portraitFrame = { width: 1080, height: 1920 };
  const landscapeClip = { width: 1920, height: 1080, clipDurationSec: 8, fps: 30, bitrateKbps: 4000 };
  const nativeClip = { width: 1080, height: 1920, clipDurationSec: 8, fps: 30, bitrateKbps: 4000 };
  const land = quality.scoreAsset(clip(landscapeClip), { frame: portraitFrame }).score;
  const nat = quality.scoreAsset(clip(nativeClip), { frame: portraitFrame }).score;
  assert.ok(land < nat, `a landscape clip (${land}) must score below a native-portrait one (${nat}) in a portrait film`);
});

t("REVIEW: a visually blank clip cannot grade hero", () => {
  // The video branch returns early, which exempted footage from the near-flat veto — while
  // `stdev` IS measured for clips. A plain-white cyclorama shot graded hero on frame size.
  const blank = quality.scoreAsset(
    clip({ width: 1920, height: 1080, clipDurationSec: 10, fps: 30, bitrateKbps: 4000, stdev: 2.1 }),
    { frame: FRAME });
  assert.ok(blank.score <= 20, `a near-flat clip must be vetoed, got ${blank.score}`);
  assert.ok((blank.vetoes || []).some((v) => /near-flat/.test(v)), JSON.stringify(blank.vetoes));
});

t("REVIEW: an uploaded video is never rejected on pixel evidence (the tier law)", () => {
  // The early return also skipped the tier floor. A user's own upload must survive it.
  const owned = quality.scoreAsset(
    clip({ source: "upload", width: 480, height: 270, clipDurationSec: 1.5, fps: 12, bitrateKbps: 90, stdev: 3 }),
    { frame: FRAME });
  assert.notStrictEqual(owned.grade, "reject", `owned material must never be rejected, got ${owned.score}/${owned.grade}`);
});

t("REVIEW: a duplicate clip is penalised like a duplicate image", () => {
  const dup = quality.scoreAsset(
    clip({ width: 1920, height: 1080, clipDurationSec: 8, fps: 30, bitrateKbps: 4000, __duplicateOf: "other.mp4" }),
    { frame: FRAME });
  assert.ok(dup.score <= 22, `a perceptual duplicate must be demoted, got ${dup.score}`);
});

// ---------------------------------------------------------------- real files
(async () => {
  const dirs = ["asset_cache/files", "public/videos"];
  let sample = null;
  for (const d of dirs) {
    const abs = path.join(__dirname, "..", d);
    if (!fs.existsSync(abs)) continue;
    const f = fs.readdirSync(abs).find((x) => x.endsWith(".mp4"));
    if (f) { sample = path.join(abs, f); break; }
  }

  if (!sample) {
    skipped("PROBE: a real MP4 reports real numbers", "no .mp4 in asset_cache/files or public/videos");
    skipped("PROBE: a missing file fails open", "(runs with the probe test)");
  } else {
    await ta("PROBE: a real MP4 reports real numbers", async () => {
      const p = await vp.probeVideo(sample);
      assert.strictEqual(p.ok, true, `probe failed: ${p.error}`);
      assert.ok(p.width > 0 && p.height > 0, "dimensions");
      assert.ok(p.durationSec > 0, "duration");
      assert.ok(p.fps > 0, "frame rate");
      assert.ok(p.bitrateKbps > 0, "bitrate");
      assert.strictEqual(typeof p.hasAudio, "boolean");
    });

    await ta("PROBE: a missing file fails open rather than throwing", async () => {
      const p = await vp.probeVideo(path.join(__dirname, "no-such-file-here.mp4"));
      assert.strictEqual(p.ok, false);
      assert.ok(p.error, "an unreadable probe must say why");
      // and it must be safe to hand straight to both graders
      assert.strictEqual(vp.gradeClip(p).ok, false);
      assert.strictEqual(vp.checkDelivery(p, want)[0].severity, "blocker");
    });
  }

  console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ""}`);
  process.exit(fail ? 1 : 0);
})();
