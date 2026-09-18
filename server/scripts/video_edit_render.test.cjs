// Render integration tests for AI Video Edit Phase 7: a real plan revision → real ffmpeg renders, offline.
// Run: node scripts/video_edit_render.test.cjs
//
// Load-bearing: the talking_head_45s fixture analysis + plan (FULL + PIP B-roll, a still-pending item, silence /
// filler / false-start / repeat cuts, punch-ins, a dip, SFX, logo, cards) over a lavfi mezzanine renders to a
// frame-exact preview with voice-led loudness, captions (SRT/VTT), credits, a layout file and a QA report; a repeated
// request is served from the record; a caption edit re-uses every A-roll chunk and a cut toggle re-encodes only the
// chunks it touched; an aspect change re-renders without re-analysis (vertical source into 16:9 → blurred fit); an
// export promotes the project to COMPLETED with card fallbacks when HyperFrames fails; an injected render failure
// fails the render (not the project) and keeps the previous export; a cancelled export leaves the project as it was;
// a B-roll whose file vanished (and cannot be re-downloaded) is dropped with a notice instead of failing the render.
// Offline: temp dirs, lavfi media, network tripwire, vision off (consent), HyperFrames stubbed.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-render-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { createStore } = require("../src/video_edit/store");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRenderJobs } = require("../src/video_edit/engine/render_jobs");
const { DEFAULT_SETTINGS } = require("../src/video_edit/settings_schema");
const { resolvePlan } = require("../src/video_edit/plan/resolve");
const { applyOps } = require("../src/video_edit/plan/ops");
const Rev = require("../src/video_edit/plan/revisions");
const { createContextLoader } = require("../src/video_edit/editing/context");
const compose = require("../src/video_edit/render/compose");
const aroll = require("../src/video_edit/render/aroll");
const { EditError } = require("../src/video_edit/errors");

const { t, run } = createHarness();
const restoreFetch = installFetchTripwire();

const FIX = path.join(__dirname, "fixtures", "video_edit");
const load = (n) => JSON.parse(fs.readFileSync(path.join(FIX, `talking_head_45s.${n}.json`), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const SRC_SEC = 44.5;

function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-400)}`);
}
function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-count_packets", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels,nb_read_packets:format=duration", "-of", "json", file], { encoding: "utf8", windowsHide: true });
  return JSON.parse(r.stdout);
}
function loudness(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8", windowsHide: true });
  const s = String(r.stderr || "");
  const tail = s.slice(s.lastIndexOf("Summary:"));
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(tail);
  return I ? Number(I[1]) : null;
}

// ---- one project, built the way the pipeline leaves it -------------------------------------------------
const root = path.join(tmp.dir, "root");
const settings = makeSettings(root);
const store = createStore({ settings, log: silentLog });
store.init();
const queue = createQueue({ settings, getTemplateActiveCount: () => 0, pollMs: 20 });

// HyperFrames is not exercised here (video_edit_cards covers it): the export's card render fails → ASS fallback.
const cardCalls = [];
const renderDeps = {
  materialize: {
    renderCard: async (a) => { cardCalls.push(a.template && a.template.id); return { ok: false, reason: "render", fallback: require("../src/video_edit/cards/render").fallbackForCard(a), cardHash: "f".repeat(40) }; },
    acquireChosen: async () => { throw new EditError("BROLL_DOWNLOAD_FAILED", { errorClass: "transient", detail: "offline test" }); },
    musicCandidates: async () => [],
  },
};
const renders = createRenderJobs({ store, queue, settings, log: silentLog, renderDeps, qaOptions: { skipVision: true }, maxQaLaps: 1 });

let P = null;       // project
let dir = null;
let words = null;

async function setup() {
  const ps = { ...clone(DEFAULT_SETTINGS), output: { aspect: "9:16" }, privacy: { allowCloudVision: false } };
  P = store.createProject({ ownerId: "owner-1", settings: ps, consent: { thirdPartyAi: true, termsVersion: "2026-09" } });
  dir = store.projectDir(P.id);
  for (const d of ["work", "analysis", "assets/broll", "assets/music"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  // mezzanine: 540×960 CFR-30 h264, GOP 30; voice: 48 kHz mono speech-like tone
  ff(["-f", "lavfi", "-i", `testsrc2=size=540x960:rate=30:duration=${SRC_SEC}`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", "30", "-an", path.join(dir, "work/mezz.mp4")]);
  ff(["-f", "lavfi", "-i", `sine=frequency=180:sample_rate=48000:duration=${SRC_SEC}`, "-af", "volume=0.25,tremolo=f=4:d=0.6", "-ac", "1", "-c:a", "pcm_s16le", path.join(dir, "work/voice48k.wav")]);
  // stock media the plan chose, a music bed and a logo
  ff(["-f", "lavfi", "-i", "mandelbrot=size=640x360:rate=25", "-t", "9", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(dir, "assets/broll/ast_pexels0001.mp4")]);
  ff(["-f", "lavfi", "-i", "testsrc=size=480x854:rate=24", "-t", "8", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(dir, "assets/broll/ast_pexels0002.mp4")]);
  ff(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=60", "-af", "volume=0.3", "-c:a", "libmp3lame", "-b:a", "96k", path.join(dir, "assets/music/ast_music001.mp3")]);
  ff(["-f", "lavfi", "-i", "color=c=0xff9900@1:size=256x96", "-frames:v", "1", "-pix_fmt", "rgba", path.join(dir, "assets/logo.png")]);
  for (const n of ["transcript", "transcript.words", "faces", "content", "audio"]) fs.copyFileSync(path.join(FIX, `talking_head_45s.${n}.json`), path.join(dir, `analysis/${n}.json`));

  await store.setStatus(P.id, "PROCESSING", { actor: "engine" });
  await store.update(P.id, (d) => {
    d.source = { ...(d.source || {}), durationSec: SRC_SEC, mezzanine: { path: "work/mezz.mp4", sha256: "a".repeat(64), width: 540, height: 960, fps: 30, durationSec: SRC_SEC } };
    d.stages = { ...(d.stages || {}), COMPRESSING: { status: "done", outputs: { mezz: { path: "work/mezz.mp4", sha256: "a".repeat(64), size: 1 } } } };
  });
  await store.setStatus(P.id, "READY", { actor: "engine" });

  const project = store.get(P.id);
  const ctx = createContextLoader({ store, maxEntries: 1 }).load(project);
  words = ctx.words;
  const raw = load("plan");
  raw.projectId = P.id;
  const plan = resolvePlan(raw, { words: ctx.words, sentences: ctx.sentences, faces: ctx.faces, mezz: { w: 540, h: 960 }, scenes: ctx.scenes });
  await Rev.commitRevision({ store, projectId: P.id, plan, author: "director", summary: "fixture", expectedRevision: 0, now: Date.now() });
}

async function edit(ops) {
  const p = store.get(P.id);
  const head = p.plan.headRevision;
  const doc = store.loadRevision(P.id, head);
  const ctx = createContextLoader({ store, maxEntries: 1 }).load(p, { plan: doc.plan, ops });
  const out = applyOps(doc.plan, ops, { ...ctx, now: Date.now(), author: "user" });
  const c = await Rev.commitRevision({ store, projectId: P.id, plan: out.plan, author: "user", summary: "test", expectedRevision: head, now: Date.now() });
  return { revision: c.revision, invalidates: out.invalidates };
}

async function renderAndWait(opts, { timeoutMs = 240000 } = {}) {
  const r = await renders.request(P.id, opts);
  const t0 = Date.now();
  for (;;) {
    const rec = (store.get(P.id).renders || []).find((x) => x.id === r.renderId);
    if (rec && ["done", "failed", "cancelled"].includes(rec.status) && !renders.isActive(P.id)) return { ...r, rec };
    if (Date.now() - t0 > timeoutMs) throw new Error(`render ${r.renderId} timed out (${rec && rec.status})`);
    await new Promise((res) => setTimeout(res, 150));
  }
}
const abs = (rel) => path.join(dir, rel);

// ---------------------------------------------------------------- pure
t("compose: deterministic, frame-exact, chunked on the source grid; pending items dropped; missing media noted", async () => {
  await setup();
  const doc = store.loadRevision(P.id, 1);
  const media = { broll: { br_0001: { path: "assets/broll/ast_pexels0001.mp4", type: "video", sha: "b1" }, br_0002: { path: "assets/broll/ast_pexels0002.mp4", type: "video", sha: "b2" } }, music: { path: "assets/music/ast_music001.mp3", sha: "m" }, sfx: {}, logo: { path: "assets/logo.png", w: 256, h: 96, sha: "l" }, cards: {} };
  const ctx = { words, faces: load("faces"), mezz: { w: 540, h: 960, sha: "mz" }, media };
  const a = compose.buildComposition(doc.plan, ctx, "preview540");
  const b = compose.buildComposition(doc.plan, ctx, "preview540");
  assert.strictEqual(a.compositionHash, b.compositionHash, "same plan + media → same composition");
  assert.strictEqual(a.durationFrames, Math.round(doc.plan.timeline.outDurationSec * 30));
  const total = a.base.pieces.reduce((s, p) => s + (p.outOutF - p.outInF), 0);
  assert.strictEqual(total, a.durationFrames, "sub-pieces tile the output exactly");
  assert.ok(a.base.chunks.every((c) => c.frames <= 300), "no chunk longer than 10 s");
  assert.ok(a.overlays.some((o) => o.kind === "broll") && a.overlays.some((o) => o.kind === "pip") && a.overlays.some((o) => o.kind === "logo"));
  assert.ok(!a.overlays.some((o) => o.id === "br_0003"), "a pending item never renders");
  const pipO = a.overlays.find((o) => o.kind === "pip"), logoO = a.overlays.find((o) => o.kind === "logo");
  const ix = Math.min(pipO.geom.x + pipO.geom.w, logoO.geom.x + logoO.geom.w) - Math.max(pipO.geom.x, logoO.geom.x);
  const iy = Math.min(pipO.geom.y + pipO.geom.h, logoO.geom.y + logoO.geom.h) - Math.max(pipO.geom.y, logoO.geom.y);
  assert.ok(ix <= 0 || iy <= 0, "a PIP in the logo's corner moves to the other side");
  assert.ok(a.notes.some((n) => n.code === "CARD_MISSING"), "graphics without card media are reported, not rendered blank");
  const x = compose.buildComposition(doc.plan, ctx, "export1080");
  assert.deepStrictEqual(x.base.pieces.map((p) => [p.outInF, p.outOutF, p.framing.crop && p.framing.crop.w]), a.base.pieces.map((p) => [p.outInF, p.outOutF, p.framing.crop && p.framing.crop.w]), "preview and export share decisions and mezz crops");
  const script = aroll.chunkFilterScript(a, a.base.chunks[0], {}).script;
  assert.ok(!/crop=w=[^:]*'/.test(script), "crop w/h are never animated (S1)");
  assert.ok(/trim=start=\d+\.\d{6}:end=\d+\.\d{6}/.test(script), "seek/trim values carry six decimals (S2)");
});

t("fit geometry is shared: a vertical take in 16:9 maps the face into the centre column for captions and QA", async () => {
  const P = require("../src/video_edit/render/profiles");
  const { faceTrackToOut } = require("../src/video_edit/plan/resolve");
  const T = require("../src/video_edit/plan/timeline");
  const mezz = { w: 540, h: 960 };
  assert.strictEqual(P.needsFit(mezz, "16:9", "none"), true, "vertical → 16:9 needs a fit");
  assert.strictEqual(P.needsFit(mezz, "9:16", "none"), false);
  const map = T.buildTimeMap([{ id: "p", srcIn: 0, srcOut: 10, outIn: 0, outOut: 10, kind: "play", rate: 1 }]);
  const faces = { mode: "tracked", keyframes: [{ t: 1, cx: 0.5, cy: 0.35, h: 0.25 }], absent: [] };
  const [f] = faceTrackToOut(faces, map, mezz, { width: 1920, height: 1080 }, "16:9");
  assert.ok(Math.abs(f.cx - 0.5) < 1e-6 && Math.abs(f.cy - 0.35) < 1e-6, "centre column, same height ratio");
  assert.ok(f.w < 0.15, `face width ${f.w} is a narrow column of the 16:9 frame (a stretched cover crop would be > 0.4)`);
  const fp = P.fitPlacement(mezz, { w: 1920, h: 1080 });
  assert.ok(Math.abs(fp.x - (1920 - 540 * (1080 / 960)) / 2) < 1e-6 && fp.y === 0);
});

// ---------------------------------------------------------------- renders
let first = null;
t("preview: frame-exact 540×960 with voice-led loudness, captions, credits, layout and a QA report", async () => {
  first = await renderAndWait({ kind: "preview" });
  const rec = first.rec;
  assert.strictEqual(rec.status, "done", JSON.stringify(rec.error));
  const pr = probe(abs(rec.files.mp4));
  const v = pr.streams.find((s) => s.codec_type === "video"), au = pr.streams.find((s) => s.codec_type === "audio");
  assert.deepStrictEqual([v.codec_name, v.width, v.height, v.pix_fmt, v.r_frame_rate], ["h264", 540, 960, "yuv420p", "30/1"]);
  const doc = store.loadRevision(P.id, rec.planRev);
  assert.strictEqual(Number(v.nb_read_packets), Math.round(doc.plan.timeline.outDurationSec * 30), "frame count = plan output duration");
  assert.ok(au && Number(au.sample_rate) === 44100 && au.channels === 2, "AAC 44.1 kHz stereo mix");
  const lu = loudness(abs(rec.files.mp4));
  assert.ok(lu > -16 && lu < -12, `integrated loudness ${lu} LUFS ≈ −14`);
  const srt = fs.readFileSync(abs(rec.files.srt), "utf8");
  assert.ok((srt.match(/-->/g) || []).length >= 5, "SRT has the cues");
  assert.ok(fs.readFileSync(abs(rec.files.credits), "utf8").includes("A. Creator"), "stock credit is written");
  const layout = JSON.parse(fs.readFileSync(abs(rec.files.layout), "utf8"));
  assert.ok(layout.elements.some((e) => e.kind === "caption") && layout.elements.some((e) => e.kind === "pip") && layout.crops.length > 0);
  assert.ok(rec.qa && typeof rec.qa.verdict === "string", "QA ran (deterministic checks; vision off by consent)");
  assert.ok(fs.existsSync(abs(`qa/${rec.id}/report.json`)));
  assert.strictEqual(store.get(P.id).status, "READY", "a preview never changes project status");
});

t("an identical request is served from the record, without work", async () => {
  const again = await renders.request(P.id, { kind: "preview" });
  assert.strictEqual(again.renderId, first.renderId);
  assert.strictEqual(again.cached, true);
});

t("a caption style edit re-uses every A-roll chunk (composite + mix only)", async () => {
  const e = await edit([{ type: "captions.setStyle", styleId: "clean" }]);
  const r = await renderAndWait({ kind: "preview", planRevision: e.revision });
  assert.strictEqual(r.rec.status, "done");
  assert.strictEqual(r.rec.segments.cacheHits, r.rec.segments.total, `chunks ${r.rec.segments.cacheHits}/${r.rec.segments.total}`);
});

t("a cut toggle re-encodes only the chunks it touched and changes the duration", async () => {
  const before = store.get(P.id).renders.filter((x) => x.status === "done").pop();
  const e = await edit([{ type: "cut.toggle", cutId: "cut_0003", enabled: false }]);
  const r = await renderAndWait({ kind: "preview", planRevision: e.revision });
  assert.strictEqual(r.rec.status, "done");
  assert.ok(r.rec.segments.cacheHits > 0 && r.rec.segments.cacheHits < r.rec.segments.total, `chunks ${r.rec.segments.cacheHits}/${r.rec.segments.total}`);
  assert.ok(r.rec.durationSec > before.durationSec, "restoring a silence makes the video longer");
});

t("aspect change → 16:9 render without re-analysis (vertical source is fitted over a blurred fill)", async () => {
  const stagesBefore = JSON.stringify(store.get(P.id).stages);
  const e = await edit([{ type: "output.setAspect", aspect: "16:9" }]);
  const r = await renderAndWait({ kind: "preview", planRevision: e.revision });
  assert.strictEqual(r.rec.status, "done", JSON.stringify(r.rec.error));
  const v = probe(abs(r.rec.files.mp4)).streams.find((s) => s.codec_type === "video");
  assert.deepStrictEqual([v.width, v.height], [960, 540]);
  const comp = JSON.parse(fs.readFileSync(abs(r.rec.files.composition), "utf8"));
  assert.strictEqual(comp.fit, true);
  assert.strictEqual(JSON.stringify(store.get(P.id).stages), stagesBefore, "no stage re-ran");
  await edit([{ type: "output.setAspect", aspect: "9:16" }]);
});

let exportRec = null;
t("export720: HyperFrames failure → ASS card fallback; project COMPLETED; current export set", async () => {
  const r = await renderAndWait({ kind: "export", profile: "export720" }, { timeoutMs: 400000 });
  exportRec = r.rec;
  assert.strictEqual(r.rec.status, "done", JSON.stringify(r.rec.error));
  assert.ok(cardCalls.length >= 1, "real cards were attempted for the export");
  const comp = JSON.parse(fs.readFileSync(abs(r.rec.files.composition), "utf8"));
  assert.ok(comp.cardAss.length >= 1, "the fallback card is burned in");
  const v = probe(abs(r.rec.files.mp4)).streams.find((s) => s.codec_type === "video");
  assert.deepStrictEqual([v.width, v.height], [720, 1280]);
  const p = store.get(P.id);
  assert.strictEqual(p.status, "COMPLETED");
  assert.strictEqual(p.exports.currentId, r.rec.id);
});

t("an injected render failure fails the render, not the project, and keeps the previous export", async () => {
  await store.update(P.id, (d) => { d.debugFaults = "render:exit1"; d.settings = { ...d.settings, debugFaults: "render:exit1" }; });
  const e = await edit([{ type: "captions.setStyle", styleId: "bold_pop" }, { type: "cut.toggle", cutId: "cut_0001", enabled: false }]);
  const r = await renderAndWait({ kind: "preview", planRevision: e.revision });
  await store.update(P.id, (d) => { d.debugFaults = null; d.settings = { ...d.settings, debugFaults: null }; });
  assert.strictEqual(r.rec.status, "failed");
  assert.ok(r.rec.error && r.rec.error.code, "the error is recorded");
  const p = store.get(P.id);
  assert.strictEqual(p.status, "COMPLETED", "project untouched");
  assert.strictEqual(p.exports.currentId, exportRec.id, "previous export kept");
  assert.ok(fs.existsSync(abs(exportRec.files.mp4)));
});

t("cancelling an export leaves the project where it was", async () => {
  const e = await edit([{ type: "captions.setStyle", styleId: "karaoke_blob" }]);
  const r = await renders.request(P.id, { kind: "export", planRevision: e.revision, profile: "export1080" });
  for (let i = 0; i < 200; i++) {
    const rec = store.get(P.id).renders.find((x) => x.id === r.renderId);
    if (rec && rec.status === "running") break;
    await new Promise((res) => setTimeout(res, 50));
  }
  await renders.cancel(P.id, { renderId: r.renderId });
  for (let i = 0; i < 400 && renders.isActive(P.id); i++) await new Promise((res) => setTimeout(res, 50));
  const rec = store.get(P.id).renders.find((x) => x.id === r.renderId);
  assert.strictEqual(rec.status, "cancelled");
  const p = store.get(P.id);
  assert.strictEqual(p.status, "COMPLETED");
  assert.strictEqual(p.exports.currentId, exportRec.id);
});

t("a B-roll whose file vanished (and cannot be re-downloaded) is dropped with a notice; the render still ships", async () => {
  fs.rmSync(abs("assets/broll/ast_pexels0001.mp4"));
  const e = await edit([{ type: "captions.setStyle", styleId: "clean" }]);
  const r = await renderAndWait({ kind: "preview", planRevision: e.revision });
  assert.strictEqual(r.rec.status, "done", JSON.stringify(r.rec.error));
  assert.ok((r.rec.notes || []).some((n) => n.code === "BROLL_UNAVAILABLE" && n.elementId === "br_0001"));
  const comp = JSON.parse(fs.readFileSync(abs(r.rec.files.composition), "utf8"));
  assert.ok(!comp.overlays.some((o) => o.id === "br_0001"));
});

run().finally(async () => {
  try { await renders.stopAll({ timeoutMs: 5000 }); } catch { /* noop */ }
  restoreFetch();
  store.close();
  if (process.env.VE_KEEP) console.log(`kept: ${tmp.dir}`); else tmp.cleanup();
});
