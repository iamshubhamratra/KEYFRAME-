// Tests for AI Video Edit transitions, looks and face-aware title placement.
// Run: node scripts/video_edit_transitions.test.cjs
//
// Load-bearing: a picture transition never changes the edit's frame count or moves any frame outside its window
// (lip-sync depends on it); every cut style plans what it says; windows never overlap or touch the edges; a joint under
// full-screen B-roll is left alone; every look is a valid ffmpeg chain; a title card moves off the speaker's face only
// when it covers it, and keeps clear of captions.

const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const TR = require("../src/video_edit/render/transitions");
const { LOOKS, lookFilter } = require("../src/video_edit/render/looks");
const compose = require("../src/video_edit/render/compose");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-transitions-");

const piece = (id, srcIn, srcOut, outIn) => ({ id, kind: "play", srcIn, srcOut, outIn, outOut: outIn + (srcOut - srcIn), rate: 1 });
function planWith(settings = {}, broll = []) {
  return {
    settings: { effects: "subtle", ...settings },
    timeline: { pieces: [piece("a", 0, 5, 0), piece("b", 6, 9, 5), piece("c", 9.5, 14, 8), piece("d", 15, 20, 12.5)] },
    broll,
  };
}
// joint frames: 150 (after "end."), 240 (mid-sentence), 375 (after "done.")
const WORDS = [
  { text: "end.", start: 4.5, end: 4.9 }, { text: "New", start: 6.1, end: 6.4 }, { text: "mid", start: 8.8, end: 8.95 },
  { text: "more", start: 9.6, end: 9.9 }, { text: "done.", start: 13.6, end: 13.9 }, { text: "Next", start: 15.1, end: 15.4 },
];
const N = 525;
const plan = (s, b) => TR.planTransitions(planWith(s, b), { words: WORDS, durationFrames: N });

section("planning");

t("timelineJoints: one joint per source gap, sentence starts recognised", () => {
  const j = TR.timelineJoints(planWith(), WORDS);
  assert.deepEqual(j.map((x) => x.jointF), [150, 240, 375]);
  assert.deepEqual(j.map((x) => x.sentenceStart), [true, false, true]);
});

t("auto (default and absent): soft crossfade inside a sentence, a stronger one where a sentence starts", () => {
  const got = plan({});
  assert.deepEqual(got.map((x) => x.kind), ["ZOOM_IN", "CROSSFADE", "CROSSFADE"]);
  assert.ok(got[1].halfF <= 3, "the in-sentence crossfade is only a few frames");
  assert.deepEqual(plan({ cutTransition: "auto" }).map((x) => x.kind), got.map((x) => x.kind));
  assert.deepEqual(plan({ effects: "dynamic" }).map((x) => x.kind), ["ZOOM_IN", "CROSSFADE", "WHIP_LEFT"]);
});

t("each cut style plans its own transition at every joint; none plans nothing", () => {
  assert.deepEqual(plan({ cutTransition: "none" }), []);
  assert.deepEqual(plan({ cutTransition: "smooth" }).map((x) => x.kind), ["CROSSFADE", "CROSSFADE", "CROSSFADE"]);
  assert.deepEqual(plan({ cutTransition: "zoom" }).map((x) => x.kind), ["ZOOM_IN", "ZOOM_IN", "ZOOM_IN"]);
  assert.deepEqual(plan({ cutTransition: "whip" }).map((x) => x.kind), ["WHIP_LEFT", "WHIP_RIGHT", "WHIP_LEFT"]);
  assert.deepEqual(plan({ cutTransition: "slide" }).map((x) => x.kind), ["SLIDE_UP", "SLIDE_UP", "SLIDE_UP"]);
  const flash = plan({ cutTransition: "flash" });
  assert.ok(flash.every((x) => x.kind === "FLASH" && x.dip && !x.xfade), "flash is a dip overlay, not an xfade");
  assert.ok(plan({ cutTransition: "whip" }).every((x) => x.blur === "h" && x.strong));
});

t("windows never overlap, never touch the edges; explicit transitions win their joint", () => {
  const got = TR.planTransitions(planWith({ cutTransition: "zoom" }), {
    words: WORDS, durationFrames: N, explicit: [{ id: "tr_1", kind: "CIRCLE_OPEN", jointF: 240, durationSec: 0.45 }, { id: "tr_2", kind: "DIP_BLACK", jointF: 375, durationSec: 0.2 }],
  });
  assert.deepEqual(got.map((x) => `${x.kind}@${x.jointF}`), ["ZOOM_IN@150", "CIRCLE_OPEN@240"], "a dip claims its joint without becoming an xfade");
  for (let i = 1; i < got.length; i++) assert.ok(got[i].jointF - got[i].halfF >= got[i - 1].jointF + got[i - 1].halfF);
  const edge = TR.planTransitions({ settings: {}, timeline: { pieces: [piece("a", 0, 0.1, 0), piece("b", 1, 5, 0.1)] }, broll: [] }, { words: [], durationFrames: 123 });
  assert.deepEqual(edge, [], "a joint 3 frames from the start is left a cut");
});

t("a joint under full-screen B-roll gets nothing", () => {
  const broll = [{ id: "br_1", layout: "FULL", status: "ok", resolved: { outIn: 4, outOut: 6, collapsed: false } }];
  assert.deepEqual(plan({ cutTransition: "zoom" }, broll).map((x) => x.jointF), [240, 375]);
});

section("rendering (real ffmpeg)");

const hasFfmpeg = spawnSync("ffmpeg", ["-hide_banner", "-version"], { encoding: "utf8", windowsHide: true }).status === 0;
const SRC = path.join(tmp.dir, "src.mp4");
function makeSource() {
  // 120 frames whose content changes every frame (a moving test pattern + frame counter noise), 540×960
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=540x960:rate=30:duration=4",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-pix_fmt", "yuv420p", SRC], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
}
function renderGraph(transitions, look = null) {
  const out = path.join(tmp.dir, `out_${Math.random().toString(36).slice(2)}.mp4`);
  const g = TR.xfadeGraph({ inLabel: "L0", outLabel: "T0", transitions, durationFrames: 120, out: { w: 540, h: 960 } });
  const tail = look ? `[T0]${look},format=yuv420p[L9];\n[L9]` : "[T0]";
  const script = `[0:v]format=yuv420p[L0];\n${g};\n${tail}trim=end_frame=120,format=yuv420p[out]`;
  const fcs = path.join(tmp.dir, "g.fcs");
  require("node:fs").writeFileSync(fcs, script);
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", SRC, "-/filter_complex", fcs, "-map", "[out]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", out], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr.slice(-800));
  return out;
}
const frames = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", f], { encoding: "utf8", windowsHide: true }).stdout.trim());
function psnr(a, b, n) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", a, "-i", b, "-filter_complex", `[0:v]select=eq(n\\,${n}),setpts=N[x];[1:v]select=eq(n\\,${n}),setpts=N[y];[x][y]psnr`, "-frames:v", "1", "-f", "null", "-"], { encoding: "utf8", windowsHide: true });
  const m = /average:([0-9.]+|inf)/.exec(r.stderr);
  return m ? (m[1] === "inf" ? 99 : Number(m[1])) : 0;
}

t("every xfade kind keeps the exact frame count, and frames outside the windows are the source frames", () => {
  if (!hasFfmpeg) return;
  makeSource();
  const kinds = Object.keys(TR.XFADE_KINDS);
  for (const kind of kinds) {
    const spec = TR.XFADE_KINDS[kind];
    const T = [{ id: "a", kind, jointF: 40, halfF: 5, xfade: spec.xfade, blur: spec.blur, zoom: spec.zoom || null, center: { fx: 0.5, fy: 0.4 } },
      { id: "b", kind, jointF: 80, halfF: 4, xfade: spec.xfade, blur: spec.blur, zoom: spec.zoom || null, center: { fx: 0.5, fy: 0.4 } }];
    const out = renderGraph(T);
    assert.equal(frames(out), 120, `${kind}: frame count`);
    for (const n of [10, 50, 70, 100]) assert.ok(psnr(out, SRC, n) > 38, `${kind}: frame ${n} is the untouched source frame`);
    assert.ok(psnr(out, SRC, 40) < 38, `${kind}: the joint frame is transitioned`);
  }
});

t("every look is a valid ffmpeg chain; natural / unknown is no filter", () => {
  assert.equal(lookFilter("natural"), "");
  assert.equal(lookFilter("sepia-nonsense"), "");
  if (!hasFfmpeg) return;
  for (const id of LOOKS.filter((x) => x !== "natural")) {
    const out = renderGraph([{ id: "a", kind: "CROSSFADE", jointF: 60, halfF: 4, xfade: "fade", blur: null, zoom: null }], lookFilter(id, { w: 540 }));
    assert.equal(frames(out), 120, `${id}: frame count`);
  }
});

section("face-aware title placement");

const OUT = { w: 540, h: 960 };
const geom = { x: 32, y: 116, w: 476, h: 282 };
const ink = { x: 38, y: 93, w: 399, h: 95 };           // the letters, centred in the card box
const face = { x: 170, y: 235, w: 210, h: 260 };       // a head just under the card's natural spot

t("a card over the face moves up into the clear space above it, inside the safe area", () => {
  const p = compose.placeCard(geom, ink, { faceBoxes: [face], captionBoxes: [], out: OUT, aspect: "9:16" });
  const top = p.y + ink.y, bottom = top + ink.h;
  assert.ok(bottom <= face.y, `ink bottom ${bottom} clears the face top ${face.y}`);
  assert.ok(top >= Math.floor(0.12 * OUT.h), `ink top ${top} stays inside the 12 % safe area`);
  assert.equal(p.overFace, 0);
});

t("a card already clear of the face does not move; no face, no move", () => {
  const low = { x: 170, y: 420, w: 210, h: 260 };
  assert.equal(compose.placeCard(geom, ink, { faceBoxes: [low], captionBoxes: [], out: OUT, aspect: "9:16" }).y, geom.y);
  assert.equal(compose.placeCard(geom, ink, { faceBoxes: [], captionBoxes: [], out: OUT, aspect: "9:16" }).y, geom.y);
});

t("with no room above the face the card goes below it, but never onto the captions", () => {
  const tall = { x: 120, y: 110, w: 300, h: 360 };      // face fills the top half
  const cap = { x: 80, y: 640, w: 380, h: 50 };
  const p = compose.placeCard(geom, ink, { faceBoxes: [tall], captionBoxes: [cap], out: OUT, aspect: "9:16" });
  const top = p.y + ink.y, bottom = top + ink.h;
  assert.ok(top >= tall.y + tall.h, "below the face");
  assert.ok(bottom <= cap.y || top >= cap.y + cap.h, "not on the caption");
  assert.equal(p.overFace, 0);
});

t("cardInk reads a fallback card's text block, not its padded box", () => {
  const fb = { region: { w: 476, h: 282 }, assEvents: [{ an: 5, x: 238, y: 141, sizePx: 38, lines: ["IS THIS THE LIFE", "YOU IMAGINED"] }] };
  const k = compose.cardInk({ status: "fallback", fallback: fb }, geom);
  assert.ok(k.h < geom.h * 0.5 && k.h > 60, `ink height ${k.h}`);
  assert.ok(Math.abs(k.y + k.h / 2 - 141) < 2, "centred where the event is");
});

run().finally(() => { restoreFetch(); tmp.cleanup(); });
