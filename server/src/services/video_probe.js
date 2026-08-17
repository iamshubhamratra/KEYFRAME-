// VIDEO PROBE — the facts about a video file, and what they mean at both ends of the pipeline.
//
// WHY THIS EXISTS. Video was the one medium nothing ever looked at. A fetched stock clip
// passed exactly one test — over 5 KB, with one decodable stream reporting non-zero width and
// height (asset_sources/util.validateMedia). No resolution floor, no duration, no frame rate,
// no bitrate, and no perceptual hash, which meant video was also the one asset type with no
// duplicate detection at all: the same clip could be fetched twice from two providers and both
// copies would be placed. At the other end, nothing ffprobed the delivered MP4. The pipeline
// could hand over a film at the wrong resolution, half the requested length, or silent after a
// voiceover was synthesised and paid for, and every check would still read green — because
// every check ran on the plan, never on the artifact.
//
// Two jobs, one set of facts:
//   probeVideo()    — ONE ffprobe call, every number both ends need.
//   gradeClip()     — is this stock clip worth placing? (input side)
//   checkDelivery() — did we ship what we said we would? (output side)
//
// FAIL-OPEN, per the house law. `probeVideo` resolves to `{ok:false, error}` rather than
// throwing, and both graders treat an unreadable probe as "no finding" — a probe that cannot
// run must never delete an asset or block a film. The only thing an unreadable probe costs is
// the check itself.

const { spawn } = require("node:child_process");
const fs = require("node:fs");

// A clip below this on its long edge cannot fill a 1080p plate without visible softness.
// Deliberately generous: stock 720p upscales acceptably behind text, and the SCORE (not this
// floor) is where a merely-adequate clip loses to a good one.
const MIN_VIDEO_LONG_EDGE = 640;
// Under this there is no shot — it is a sting or a broken download, and a composer that asks
// for a 3-second bed will loop it into a stutter.
const MIN_VIDEO_SEC = 1.5;

const num = (v) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ffprobe reports frame rate as a rational string ("30000/1001"). NaN and 0/0 are both real
// answers from real files, so both must degrade to null rather than to 0.
function parseRate(s) {
  if (!s || typeof s !== "string") return null;
  const [a, b] = s.split("/");
  const n = Number(a), d = b === undefined ? 1 : Number(b);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0 || n === 0) return null;
  return n / d;
}

/**
 * Every number either end of the pipeline needs, from ONE ffprobe call.
 * Never rejects: an unreadable file resolves {ok:false, error}.
 */
function probeVideo(absPath, { timeoutMs = 20_000 } = {}) {
  return new Promise((resolve) => {
    let sizeBytes = null;
    try { sizeBytes = fs.statSync(absPath).size; }
    catch { return resolve({ ok: false, error: "file missing", sizeBytes: null }); }

    const p = spawn("ffprobe", [
      "-v", "error",
      // One invocation, both scopes. Two separate -show_entries flags would OVERRIDE each
      // other rather than combine — the colon form is the one that returns both.
      "-show_entries", "format=duration,bit_rate,size:stream=index,codec_type,codec_name,width,height,avg_frame_rate,channels,sample_rate,duration",
      "-of", "json",
      absPath,
    ], { windowsHide: true });

    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, timeoutMs);
    // `unavailable` separates "we could not RUN the check" from "the FILE is bad". Without it
    // a host with no ffprobe on PATH reports every perfect film as an undecodable blocker —
    // the tool's own absence dressed up as a defect in the user's video.
    p.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, unavailable: true, error: `ffprobe unavailable (${e.message})`, sizeBytes }); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, error: "not decodable", sizeBytes });
      let j;
      try { j = JSON.parse(out); } catch { return resolve({ ok: false, error: "unparseable probe", sizeBytes }); }

      const streams = Array.isArray(j.streams) ? j.streams : [];
      const v = streams.find((s) => s.codec_type === "video") || null;
      const a = streams.find((s) => s.codec_type === "audio") || null;
      const fmt = j.format || {};

      // Duration lives on the container for a well-formed MP4 and on the stream for many
      // stock clips. Take whichever is present; a WebM from Openverse often has only one.
      const durationSec = num(fmt.duration) ?? (v ? num(v.duration) : null);
      const width = v ? num(v.width) : null;
      const height = v ? num(v.height) : null;
      const bitrate = num(fmt.bit_rate);

      resolve({
        ok: Boolean(v && width > 0 && height > 0),
        error: v ? null : "no video stream",
        width, height,
        pixels: width && height ? width * height : null,
        longEdge: width && height ? Math.max(width, height) : null,
        durationSec,
        fps: v ? parseRate(v.avg_frame_rate) : null,
        codec: v ? String(v.codec_name || "") : null,
        bitrateKbps: bitrate ? Math.round(bitrate / 1000) : null,
        sizeBytes: num(fmt.size) ?? sizeBytes,
        hasAudio: Boolean(a),
        audioCodec: a ? String(a.codec_name || "") : null,
        audioChannels: a ? num(a.channels) : null,
        audioSampleRate: a ? num(a.sample_rate) : null,
      });
    });
  });
}

/**
 * INPUT SIDE — is this stock clip worth placing?
 * Returns {ok, reasons[]}. `ok:false` means reject the download outright; everything softer
 * is left to the score, because a floor that rejects too eagerly starves a film.
 */
function gradeClip(probe, { minLongEdge = MIN_VIDEO_LONG_EDGE, minSec = MIN_VIDEO_SEC } = {}) {
  const reasons = [];
  if (!probe || !probe.ok) return { ok: false, reasons: [probe && probe.error ? probe.error : "unreadable"] };
  if (probe.longEdge != null && probe.longEdge < minLongEdge) {
    reasons.push(`long edge ${probe.longEdge}px is below the ${minLongEdge}px floor`);
  }
  // UNKNOWN IS NOT BAD. A missing duration is common in stock WebM and must not reject — and
  // a duration of exactly 0 is the SAME statement of ignorance wearing a number: a fragmented
  // MP4 or a stream-copied remux reports "0.000000" for a container header it never wrote.
  // `!= null` admitted that 0 as fact and rejected a perfectly good clip for it.
  if (probe.durationSec > 0 && probe.durationSec < minSec) {
    reasons.push(`${probe.durationSec.toFixed(2)}s is too short to hold a beat (min ${minSec}s)`);
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * OUTPUT SIDE — did we ship what we said we would?
 * Pure. Returns delivery_quality-shaped findings: {severity, area, detail, fix}.
 *
 * `expected` is what the JOB asked for: {width, height, fps, durationSec, expectAudio}.
 * Every field is optional; an absent expectation simply produces no finding.
 */
function checkDelivery(probe, expected = {}) {
  const issues = [];
  const add = (severity, detail, fix) => issues.push({ severity, area: "delivery", detail, fix: fix || null });

  if (!probe) return issues;                       // never ran — nothing to say
  // The prober itself could not run. We have learned NOTHING about this film, and "we could
  // not check" must never be reported to a user as "your film is broken".
  if (probe.unavailable) return issues;
  if (!probe.ok) {
    add("blocker",
      `The delivered file could not be decoded (${probe.error || "unknown"}).`,
      "Regenerate the film; if it repeats, the render step failed silently.");
    return issues;                                  // every other check is meaningless now
  }

  const w = num(expected.width), h = num(expected.height);
  if (w && h && probe.width && probe.height && (probe.width !== w || probe.height !== h)) {
    add("major",
      `Delivered at ${probe.width}x${probe.height}, but ${w}x${h} was requested.`,
      "Check the render resolution — the film will letterbox or upscale on the target surface.");
  }

  const wantSec = num(expected.durationSec);
  // `> 0` rather than `!= null` for the same reason as the clip floor: a container that
  // reports 0 is telling us it does not know, and reading that as "the film is 0 seconds long"
  // would blocker every such delivery.
  if (wantSec && probe.durationSec > 0) {
    // The mix trims to the visual, and container rounding costs a frame or two, so only a
    // difference a viewer would notice counts: 1.5s or 12% of the film, whichever is larger.
    const tol = Math.max(1.5, wantSec * 0.12);
    const drift = probe.durationSec - wantSec;
    if (Math.abs(drift) > tol) {
      add(Math.abs(drift) > wantSec * 0.4 ? "blocker" : "major",
        `Delivered ${probe.durationSec.toFixed(1)}s against a planned ${wantSec.toFixed(1)}s (${drift > 0 ? "+" : ""}${drift.toFixed(1)}s).`,
        drift < 0 ? "The film was cut short — scenes at the end may be missing." : "The film runs long — the tail may hold on a static frame.");
    }
  }

  const wantFps = num(expected.fps);
  if (wantFps && probe.fps != null && probe.fps < wantFps * 0.9) {
    add("minor",
      `Delivered at ${probe.fps.toFixed(1)}fps against a requested ${wantFps}fps.`,
      "Motion will read as judder; check the render's frame pacing.");
  }

  // THE SILENT FILM. This is the finding that motivated the output side: a voiceover can be
  // written, synthesised, levelled and paid for, and still not reach the container.
  if (expected.expectAudio && !probe.hasAudio) {
    add("blocker",
      "The film has no audio track, but a voiceover, music or sound effects were prepared for it.",
      "The audio mix did not reach the delivered file — regenerate, and check the mix step's log.");
  }

  // A plausibility floor, not a quality target: this catches a render that collapsed to a
  // near-empty stream, which no other check would notice.
  if (probe.bitrateKbps != null && probe.pixels) {
    const perMegapixel = probe.bitrateKbps / (probe.pixels / 1_000_000);
    if (perMegapixel < 120) {
      add("minor",
        `Very low bitrate for the frame size (${probe.bitrateKbps}kbps at ${probe.width}x${probe.height}).`,
        "The picture is likely to show blocking on flat colour — check the encoder settings.");
    }
  }

  return issues;
}

/**
 * Probe the finished film and record it on the job. Called once at finalize from each of the
 * three pipelines; `assessDelivery` reads what this leaves behind.
 *
 * FAIL-OPEN AND THEN SOME: this runs after the film is already made, so nothing it does may
 * cost the user their video. Every failure path returns null and leaves the job untouched.
 */
async function recordDeliveryProbe(jobId, videoPath, expected = {}) {
  try {
    const probe = await probeVideo(videoPath);
    const issues = checkDelivery(probe, expected);
    const record = {
      ...probe,
      expected: {
        width: num(expected.width), height: num(expected.height),
        fps: num(expected.fps), durationSec: num(expected.durationSec),
        expectAudio: !!expected.expectAudio,
      },
      issues,
      at: null,           // stamped by the caller's clock if it wants one
    };
    try { require("../db").setDeliveryProbe(jobId, record); } catch { /* disclosure only */ }
    if (issues.length) {
      console.log(`[delivery] ${jobId}: ${issues.length} issue(s) in the delivered file — `
        + issues.map((i) => `${i.severity}: ${i.detail}`).join(" | "));
    } else if (probe.ok) {
      console.log(`[delivery] ${jobId}: ${probe.width}x${probe.height} ${probe.durationSec != null ? probe.durationSec.toFixed(1) + "s" : "?"} `
        + `${probe.fps != null ? probe.fps.toFixed(0) + "fps" : ""} ${probe.hasAudio ? probe.audioCodec : "SILENT"} — matches the plan`);
    }
    return record;
  } catch (e) {
    console.warn(`[delivery] probe failed for ${jobId} (${e.message}) — the film is unaffected`);
    return null;
  }
}

module.exports = {
  probeVideo, gradeClip, checkDelivery, recordDeliveryProbe,
  MIN_VIDEO_LONG_EDGE, MIN_VIDEO_SEC, parseRate,
};
