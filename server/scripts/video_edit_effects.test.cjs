// Tests for the AI Video Edit effects + B-roll conform modules: render/exprs.js, broll/conform.js, assets/masks.
// Run: node scripts/video_edit_effects.test.cjs
//
// Load-bearing, measured on real ffmpeg output (offline, temp dirs):
//   - crop math: even, inside the frame, aspect within 1 px (exact in exactAspect mode), centred when unclamped —
//     swept over 1920x1080 / 1080x1920 mezz × 9:16 / 16:9 / 1:1 × zooms × focus points.
//   - ZOOM_EMPHASIS: the generated K expression equals the S1/RENDER.md literal; a 1.0→1.12 zoom over 27 frames on a grid
//     has centre drift ≤ 0.3 px, zoom error ≤ 0.3 px at the edge, frame 0 unzoomed (1-based `in`), monotonic scale.
//   - pan: every frame's crop position (recovered exactly from a coded pattern) is within ±1 px of an independent
//     smoothstep model, and exact at keyframe frames.
//   - freeze adds exactly hold frames (clones of the last frame); speed gives round(N/R) frames.
//   - blur fill / split: exact output dims and frame counts; fg/bg placement.
//   - FULL / PIP / DIP / FLASH / logo overlays: pixels at fade midpoints match the blend of measured endpoints.
//   - conformClip: dims, 30 fps, exact frame count, BT.709 tags, no audio, trim accuracy by content, focus, cache hit,
//     short-source shift, handles. kenBurnsStill: exact frames, drift of the zoom's fixed point ≤ 0.3 px.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");

const X = require("../src/video_edit/render/exprs");
const C = require("../src/video_edit/broll/conform");
const { encodePng, allMasks, decodePngFilter0 } = require("./video_edit_gen_masks.js");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-fx-");
const W = tmp.dir;
const measured = {};

// ---- helpers --------------------------------------------------------------------------------------------------------
function ff(args, { cwd = W } = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", ...args], { cwd, windowsHide: true, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-800)}`);
  return r.stdout;
}
function probe(file, entries) {
  const r = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-of", "json", "-show_entries", entries, file], { cwd: W, windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
function graphRun(name, graph, inputs, outArgs) {
  const fcs = `${name}.fcs`;
  fs.writeFileSync(path.join(W, fcs), graph + "\n");
  return ff(["-y", ...inputs, "-/filter_complex", fcs, ...outArgs]);
}
const rawOut = (label, pixFmt = "rgb24") => ["-map", `[${label}]`, "-f", "rawvideo", "-pix_fmt", pixFmt, "-"];
const RGB_709 = "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24";
function pixel(buf, w, h, frame, x, y) { const o = (frame * w * h + y * w + x) * 3; return [buf[o], buf[o + 1], buf[o + 2]]; }
const mix = (a, b, alpha) => a.map((v, i) => v + (b[i] - v) * alpha);
function near(actual, expected, tol, what) {
  const d = Math.max(...actual.map((v, i) => Math.abs(v - expected[i])));
  assert.ok(d <= tol, `${what}: got [${actual}] want [${expected.map((v) => Math.round(v))}] (Δ ${d.toFixed(1)} > ${tol})`);
  return d;
}
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s >>> 24; }; }
function solidClip(file, { w, h, frames, color }) {
  ff(["-y", "-f", "lavfi", "-i", `color=c=${color}:s=${w}x${h}:r=30`, "-frames:v", String(frames), "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p", file]);
}

// Grid-line centroids on one gray row and a per-frame least-squares scale/translation fit (S1 abs.cjs method).
function lines(row, w) {
  const out = []; let x = 0;
  while (x < w) {
    if (row[x] > 60) { let s = 0, sx = 0; const x0 = x; while (x < w && row[x] > 20) { s += row[x]; sx += row[x] * x; x++; } if (x0 > 0 && x < w) out.push(sx / s); } else x++;
  }
  return out;
}
function fitZoom(rowsZoom, rowsStatic, w, zOf, centre) {
  const zMax = Math.max(...Array.from({ length: rowsZoom.length / w }, (_, n) => zOf(n)));
  const base = lines(rowsStatic.subarray(0, w), w).filter((x) => Math.abs(x - centre) * zMax < w / 2 - 8);
  const F = rowsZoom.length / w, res = [];
  for (let n = 0; n < F; n++) {
    const L = lines(rowsZoom.subarray(n * w, (n + 1) * w), w), pairs = [];
    for (const x0 of base) {
      const pred = centre + (x0 - centre) * zOf(n); let best = null;
      for (const x of L) if (best === null || Math.abs(x - pred) < Math.abs(best - pred)) best = x;
      if (best !== null && Math.abs(best - pred) < 8) pairs.push([x0, best]);
    }
    const m = pairs.length, sx = pairs.reduce((s, p) => s + p[0], 0), sy = pairs.reduce((s, p) => s + p[1], 0);
    const sxx = pairs.reduce((s, p) => s + p[0] * p[0], 0), sxy = pairs.reduce((s, p) => s + p[0] * p[1], 0);
    const b = (m * sxy - sx * sy) / (m * sxx - sx * sx), a = (sy - b * sx) / m;
    res.push({ n, lines: m, b, e: a + b * centre - centre, zErrEdgePx: Math.abs(b - zOf(n)) * (w / 2) });
  }
  return {
    frames: F, linesTracked: base.length, res,
    maxDriftPx: Math.max(...res.map((r) => Math.abs(r.e))),
    maxZoomErrEdgePx: Math.max(...res.map((r) => r.zErrEdgePx)),
    monotonic: res.every((r, i) => i === 0 || r.b >= res[i - 1].b - 1e-4 * Math.sign(zOf(1) - zOf(0) || 1)),
  };
}

// ---- crop math ------------------------------------------------------------------------------------------------------
section("render/exprs — crop geometry");

t("cropForZoom: even, inside frame, aspect within 1 px, centred when unclamped (sweep)", () => {
  const outs = { "9:16": [{ w: 540, h: 960 }, { w: 1080, h: 1920 }], "16:9": [{ w: 960, h: 540 }, { w: 1920, h: 1080 }], "1:1": [{ w: 720, h: 720 }, { w: 1080, h: 1080 }] };
  let n = 0, maxAspectErr = 0;
  for (const mezz of [{ w: 1920, h: 1080 }, { w: 1080, h: 1920 }]) {
    for (const [aspect, sizes] of Object.entries(outs)) for (const output of sizes) for (const zoom of [1, 1.05, 1.1, 1.2, 1.35, 1.5]) {
      let prevW = Infinity;
      for (const cx of [0, 0.1, 0.37, 0.5, 0.9, 1]) for (const cy of [0, 0.2, 0.5, 0.8, 1]) for (const fyt of [0.38, 0.4, 0.42]) {
        const c = X.cropForZoom({ mezz, output, cx, cy, zoom, faceYTarget: fyt });
        const tag = `${mezz.w}x${mezz.h}→${aspect}@${output.w} z${zoom} (${cx},${cy})`;
        for (const k of ["x", "y", "w", "h"]) assert.ok(Number.isInteger(c[k]) && c[k] % 2 === 0, `${tag}: ${k}=${c[k]} not even`);
        assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= mezz.w && c.y + c.h <= mezz.h, `${tag}: outside ${JSON.stringify(c)}`);
        const A = output.w / output.h;
        const errPx = Math.min(Math.abs(c.w - c.h * A), Math.abs(c.h - c.w / A));
        assert.ok(errPx <= 1 + 1e-9, `${tag}: aspect error ${errPx} px`);
        maxAspectErr = Math.max(maxAspectErr, errPx);
        assert.ok(Math.abs(c.effectiveZoom - zoom) / zoom < 0.01, `${tag}: effective zoom ${c.effectiveZoom}`);
        const ux = cx * mezz.w - c.w / 2;
        if (ux > 2 && ux < mezz.w - c.w - 2) assert.ok(Math.abs(c.x + c.w / 2 - cx * mezz.w) <= 1, `${tag}: x not centred`);
        const uy = cy * mezz.h - fyt * c.h;
        if (uy > 2 && uy < mezz.h - c.h - 2) assert.ok(Math.abs(c.y + fyt * c.h - cy * mezz.h) <= 1, `${tag}: y not on faceYTarget`);
        prevW = Math.min(prevW, c.w);
        n++;
      }
    }
  }
  // Exact-aspect lattice mode.
  for (const mezz of [{ w: 1920, h: 1080 }, { w: 1080, h: 1920 }]) for (const output of [{ w: 1080, h: 1920 }, { w: 1920, h: 1080 }, { w: 1080, h: 1080 }]) for (const zoom of [1, 1.1, 1.2]) {
    const c = X.cropForZoom({ mezz, output, cx: 0.5, cy: 0.5, zoom, exactAspect: true });
    assert.equal(c.w * output.h, c.h * output.w, `exactAspect ${JSON.stringify(c)}`);
    assert.ok(c.w % 2 === 0 && c.h % 2 === 0 && c.x + c.w <= mezz.w && c.y + c.h <= mezz.h);
    assert.ok(c.effectiveZoom >= zoom - 1e-9, "lattice may only zoom in further");
  }
  // Zoom monotonic: more zoom never widens the crop.
  let prev = Infinity;
  for (let z = 1; z <= 1.5; z += 0.01) { const c = X.cropForZoom({ mezz: { w: 1920, h: 1080 }, output: { w: 1080, h: 1920 }, zoom: z }); assert.ok(c.w <= prev); prev = c.w; }
  const s1 = X.cropForZoom({ mezz: { w: 1920, h: 1080 }, output: { w: 1080, h: 1920 }, cx: 1204 / 1920, cy: 0.5 });
  assert.deepEqual([s1.x, s1.y, s1.w, s1.h], [900, 0, 608, 1080]);
  measured.cropSweep = { cases: n, maxAspectErrPx: maxAspectErr };
});

t("zoom K expression and filter equal the S1 / RENDER.md literal", () => {
  const K = "((1-1/(1+0.12*(3*pow(min(max((in-1),0)/26,1),2)-2*pow(min(max((in-1),0)/26,1),3))))/2)";
  assert.equal(X.zoomKExpr({ z0: 1, z1: 1.12, frames: 27 }), K);
  const want = `crop=608:1080:900:0,perspective=x0='W*${K}':y0='H*${K}':x1='W-W*${K}':y1='H*${K}':x2='W*${K}':y2='H-H*${K}':x3='W-W*${K}':y3='H-H*${K}':interpolation=linear:sense=source:eval=frame,scale=1080:1920:flags=lanczos,setsar=1`;
  assert.equal(X.perspectiveZoomFilter({ crop: { x: 900, y: 0, w: 608, h: 1080 }, z0: 1, z1: 1.12, frames: 27, out: { w: 1080, h: 1920 } }), want);
  assert.equal(X.staticFramingFilter({ crop: { x: 900, y: 0, w: 608, h: 1080 }, out: { w: 1080, h: 1920 } }), "crop=608:1080:900:0,scale=1080:1920:flags=lanczos,setsar=1");
  assert.throws(() => X.zoomKExpr({ z0: 1, z1: 1.1, frames: 1 }), /FX_INVALID|frames/);
});

// ---- rendered effects -----------------------------------------------------------------------------------------------
section("render/exprs — rendered effects");

t("ZOOM_EMPHASIS 1.0→1.12 over 27 frames: drift ≤ 0.3 px, monotonic, frame 0 unzoomed", () => {
  const crop = { x: 900, y: 0, w: 608, h: 1080 }, out = { w: 1080, h: 1920 };
  const src = ["-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=30:d=0.9,drawgrid=w=40:h=40:t=2:c=white,format=yuv420p"];
  const row = ",format=gray,crop=1080:1:0:960";
  const started = Date.now();
  const zoom = graphRun("zoom", `[0:v]${X.perspectiveZoomFilter({ crop, z0: 1, z1: 1.12, frames: 27, out })}${row}[o]`, src, rawOut("o", "gray"));
  const fps = 27 / ((Date.now() - started) / 1000);
  const stat = graphRun("zoom_static", `[0:v]${X.staticFramingFilter({ crop, out })}${row}[o]`, src, rawOut("o", "gray"));
  const zOf = (n) => { const p = Math.min(n / 26, 1); return 1 + 0.12 * (3 * p * p - 2 * p * p * p); };
  const f = fitZoom(zoom, stat, 1080, zOf, 539.5);
  assert.equal(f.frames, 27);
  assert.ok(f.linesTracked >= 10, `only ${f.linesTracked} lines`);
  assert.ok(f.maxDriftPx <= 0.3, `centre drift ${f.maxDriftPx}`);
  assert.ok(f.maxZoomErrEdgePx <= 0.3, `zoom error ${f.maxZoomErrEdgePx}`);
  assert.ok(f.monotonic, "scale not monotonic");
  assert.ok(Math.abs(f.res[0].b - 1) * 540 < 0.15, `frame 0 already zoomed: b=${f.res[0].b}`);
  measured.zoomEmphasis = { maxDriftPx: +f.maxDriftPx.toFixed(3), maxZoomErrEdgePx: +f.maxZoomErrEdgePx.toFixed(3), frame0b: +f.res[0].b.toFixed(5), frame26b: +f.res[26].b.toFixed(5), wallFps: +fps.toFixed(1) };
});

t("pan: crop position within ±1 px of the smoothstep model every frame, exact at keyframes", () => {
  const SW = 960, SH = 540, cw = 320, ch = 180;
  const rnd = lcg(12345), A = Array.from({ length: SW }, rnd), B = Array.from({ length: SH }, rnd);
  const img = Buffer.alloc(SW * SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) img[y * SW + x] = (A[x] + B[y]) & 255;
  fs.writeFileSync(path.join(W, "pattern.png"), encodePng(SW, SH, 1, img));
  const start = 12;
  const kf = [{ src: 12.0, x: 100, y: 40 }, { src: 12.3, x: 100, y: 40 }, { src: 12.8, x: 420, y: 200 }, { src: 13.2, x: 420, y: 200 }, { src: 13.7, x: 0, y: 300 }];
  const frames = 57;
  const chain = X.panFramingFilter({ crop: { w: cw, h: ch }, keyframes: kf, pieceStartS: start });
  assert.match(chain, /exact=1/);
  const inputs = X.inputArgs({ path: "pattern.png", format: "image2", options: ["-loop", "1", "-framerate", "30", "-t", X.fmt6(frames / 30)] });
  const buf = graphRun("pan", `[0:v]format=gray,${chain}[o]`, inputs, rawOut("o", "gray"));
  assert.equal(buf.length, cw * ch * frames);
  const model = (tt, key) => {
    const pts = kf.map((k) => ({ t: Math.round((k.src - start) * 30) / 30, v: k[key] }));
    if (tt <= pts[0].t) return pts[0].v;
    for (let i = 0; i < pts.length - 1; i++) {
      if (tt < pts[i + 1].t) { const p = (tt - pts[i].t) / (pts[i + 1].t - pts[i].t); return pts[i].v + (pts[i + 1].v - pts[i].v) * (3 * p * p - 2 * p * p * p); }
    }
    return pts[pts.length - 1].v;
  };
  const findShift = (vals, table, span) => {
    const hits = [];
    for (let s = 0; s <= span; s++) { const c = (vals[0] - table[s]) & 255; let ok = true; for (let i = 1; i < vals.length && ok; i++) ok = ((vals[i] - table[s + i]) & 255) === c; if (ok) hits.push(s); }
    return hits;
  };
  let maxErr = 0;
  for (let n = 0; n < frames; n++) {
    const o = n * cw * ch;
    const row = Array.from(buf.subarray(o, o + cw)), col = Array.from({ length: ch }, (_, j) => buf[o + j * cw]);
    const xs = findShift(row, A, SW - cw), ys = findShift(col, B, SH - ch);
    assert.equal(xs.length, 1, `frame ${n}: x ambiguous ${xs}`);
    assert.equal(ys.length, 1, `frame ${n}: y ambiguous ${ys}`);
    const ex = model(n / 30, "x"), ey = model(n / 30, "y");
    const err = Math.max(Math.abs(xs[0] - ex), Math.abs(ys[0] - ey));
    maxErr = Math.max(maxErr, err);
    assert.ok(err <= 1, `frame ${n}: got (${xs[0]},${ys[0]}) want (${ex.toFixed(2)},${ey.toFixed(2)})`);
    const key = kf.find((k) => Math.round((k.src - start) * 30) === n);
    if (key) assert.deepEqual([xs[0], ys[0]], [key.x, key.y], `keyframe frame ${n}`);
  }
  measured.pan = { frames, maxErrPx: +maxErr.toFixed(3) };
});

t("freeze adds exactly hold frames (clones); speed gives round(N/R) frames", () => {
  // Every frame differs (luma ramps with N) so a clone is distinguishable from a new frame.
  const src = ["-f", "lavfi", "-i", "nullsrc=s=64x36:r=30:d=3,geq=lum='mod(N*7+X,256)':cb=128:cr=128,format=yuv420p"];
  const fz = X.freezeFilters({ holdFrames: 13 });
  assert.equal(fz.audio, "apad=pad_len=20800");
  const buf = graphRun("freeze", `[0:v]trim=end_frame=20,setpts=PTS-STARTPTS,${fz.video}[o]`, src, rawOut("o", "gray"));
  const fsz = 64 * 36;
  assert.equal(buf.length / fsz, 33);
  const last = buf.subarray(19 * fsz, 20 * fsz);
  for (let n = 20; n < 33; n++) assert.ok(buf.subarray(n * fsz, (n + 1) * fsz).equals(last), `frame ${n} not a clone`);
  assert.ok(!buf.subarray(18 * fsz, 19 * fsz).equals(last), "source frames must differ (fixture sanity)");
  const counts = {};
  for (const [rate, n] of [[2, 30], [0.5, 30], [1.5, 31], [0.8, 45]]) {
    const sp = X.speedFilters({ rate, srcFrames: n });
    const out = graphRun(`speed${rate}`, `[0:v]trim=end_frame=${n},${sp.video}[o]`, src, rawOut("o", "gray"));
    assert.equal(out.length / fsz, sp.outFrames, `rate ${rate}`);
    assert.equal(sp.outFrames, Math.round(n / rate));
    counts[rate] = sp.outFrames;
  }
  assert.equal(X.speedFilters({ rate: 3, srcFrames: 30 }).audio, "atempo=2,atempo=1.5");
  measured.speedFrames = counts;
});

t("blur fill: exact dims both ways, foreground centred, sides blurred", () => {
  for (const [sw, sh, ow, oh] of [[360, 640, 960, 540], [640, 360, 540, 960]]) {
    const fr = X.blurFillFilter({ inLabel: "in", outLabel: "bf", out: { w: ow, h: oh } });
    const name = `blur_${sw}x${sh}`;
    graphRun(name, `[0:v]format=yuv420p[in];${fr.graph}`, ["-f", "lavfi", "-i", `testsrc2=s=${sw}x${sh}:r=30:d=0.5`],
      ["-map", "[bf]", "-c:v", "rawvideo", "-pix_fmt", "gray", "-f", "nut", `${name}.nut`]);
    const p = probe(`${name}.nut`, "stream=width,height,nb_read_frames").streams[0];
    assert.deepEqual([p.width, p.height, Number(p.nb_read_frames)], [ow, oh, 15]);
  }
  const g = ff(["-i", "blur_360x640.nut", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const grad = (x0, x1) => { let s = 0, c = 0; for (let y = 0; y < 540; y += 3) for (let x = x0; x < x1 - 1; x++) { s += Math.abs(g[y * 960 + x + 1] - g[y * 960 + x]); c++; } return s / c; };
  const side = grad(0, 150), centre = grad(400, 560);
  assert.ok(centre > 3 * side, `centre gradient ${centre.toFixed(2)} vs blurred side ${side.toFixed(2)}`);
  measured.blurFill = { sideGrad: +side.toFixed(2), centreGrad: +centre.toFixed(2) };
});

t("split (9:16 top B-roll + face bottom): exact dims/frames, halves in place, short clip cloned", () => {
  solidClip(path.join(W, "split_broll.mp4"), { w: 540, h: 480, frames: 10, color: "0xE0C020" });
  const faceCrop = X.cropForZoom({ mezz: { w: 1280, h: 720 }, output: { w: 540, h: 480 }, cx: 0.5, cy: 0.5 });
  const fr = X.splitStackFilter({ faceLabel: "face", outLabel: "sp", out: { w: 540, h: 960 }, faceCrop, side: "top", broll: { path: "split_broll.mp4", frames: 15 }, inputIndex: 1 });
  assert.equal(fr.nextInputIndex, 2);
  graphRun("split", `[0:v]trim=end_frame=15,setpts=PTS-STARTPTS,format=yuv420p[face];${fr.graph}`,
    ["-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=1", ...fr.inputs.flatMap(X.inputArgs)], ["-map", "[sp]", "-c:v", "rawvideo", "-pix_fmt", "rgb24", "-f", "nut", "split.nut"]);
  const p = probe("split.nut", "stream=width,height,nb_read_frames").streams[0];
  assert.deepEqual([p.width, p.height, Number(p.nb_read_frames)], [540, 960, 15]);
  const buf = ff(["-i", "split.nut", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  const top14 = pixel(buf, 540, 960, 14, 270, 240), top0 = pixel(buf, 540, 960, 0, 270, 240);
  near(top14, top0, 2, "cloned B-roll frame");
  assert.ok(top0[0] > 180 && top0[1] > 150 && top0[2] < 80, `top half is not the B-roll colour: ${top0}`);
  let varSum = 0; for (let x = 0; x < 540; x += 7) { const q = pixel(buf, 540, 960, 5, x, 720); varSum += Math.abs(q[0] - top0[0]) + Math.abs(q[2] - top0[2]); }
  assert.ok(varSum > 2000, "bottom half should be the A-roll content");
});

// ---- composite overlays ---------------------------------------------------------------------------------------------
section("render/exprs — composite overlays");
const BASE = ["-f", "lavfi", "-i", "color=c=0x3264C8:s=320x180:r=30:d=2"];
const TAGGED_BASE = `[0:v]format=yuv420p,${X.COLOR_TAG_FILTER}[base]`;

t("FULL B-roll: -itsoffset + frame-based alpha fades composite at the right frames", () => {
  solidClip(path.join(W, "full.mp4"), { w: 320, h: 180, frames: 30, color: "0xE0C020" });
  const fr = X.fullBrollOverlay({ baseLabel: "base", outLabel: "ov", clip: { path: "full.mp4" }, outInF: 15, outOutF: 45, fadeInF: 6, fadeOutF: 6, inputIndex: 1 });
  assert.deepEqual(fr.inputs[0].options, ["-itsoffset", "0.500000"]);
  const buf = graphRun("full", `${TAGGED_BASE};${fr.graph};[ov]${RGB_709}[o]`, [...BASE, ...fr.inputs.flatMap(X.inputArgs)], rawOut("o"));
  assert.equal(buf.length / (320 * 180 * 3), 60);
  const P = (n) => pixel(buf, 320, 180, n, 160, 90);
  const A = P(5), Bc = P(30);
  const alpha = (g) => { const k = g - 15; if (k < 0 || k >= 30) return 0; if (k < 6) return k / 6; if (k >= 24) return 1 - (k - 24) / 6; return 1; };
  let maxD = 0;
  for (const g of [14, 15, 16, 18, 20, 21, 30, 38, 39, 42, 44, 45, 50]) maxD = Math.max(maxD, near(P(g), mix(A, Bc, alpha(g)), 4, `frame ${g} (α ${alpha(g).toFixed(2)})`));
  measured.fullBroll = { base: A, clip: Bc, midFadeIn: P(18), midFadeOut: P(42), maxDelta: +maxD.toFixed(1) };
});

t("PIP: rounded mask + shadow (shipped PNGs), fades, eof pass-through", () => {
  const box = { x: 120, y: 50, w: 160, h: 90 };
  solidClip(path.join(W, "pip.mp4"), { w: 160, h: 90, frames: 30, color: "0xE0C020" });
  const mf = X.pipMaskFiles({ box, radius: 32 });
  assert.equal(mf.aspectKey, "16x9");
  assert.ok(fs.existsSync(mf.mask) && fs.existsSync(mf.shadow));
  const fr = X.pipOverlay({ baseLabel: "base", outLabel: "pip", clip: { path: "pip.mp4" }, box, radius: 32, outInF: 15, outOutF: 45, fadeInF: 6, fadeOutF: 6, inputIndex: 1 });
  assert.equal(fr.inputs.length, 3);
  const buf = graphRun("pip", `${TAGGED_BASE};${fr.graph};[pip]${RGB_709}[o]`, [...BASE, ...fr.inputs.flatMap(X.inputArgs)], rawOut("o"));
  assert.equal(buf.length / (320 * 180 * 3), 60);
  const P = (n, x, y) => pixel(buf, 320, 180, n, x, y);
  const A = P(5, 200, 95), Bc = P(30, 200, 95);
  assert.ok(Math.abs(Bc[0] - A[0]) > 100, "clip visible at frame 30");
  near(P(30, 10, 10), A, 3, "far pixel is base");
  // The shadow fades with the clip, so at α = .5 the base under the card is darkened by shadowOpacity·α first.
  const midExpect = mix(mix(A, [0, 0, 0], X.PIP_MASK.shadow.opacity * 0.5), Bc, 0.5);
  near(P(18, 200, 95), midExpect, 5, "PIP fade-in midpoint (shadow + clip at α .5)");
  near(P(42, 200, 95), midExpect, 5, "PIP fade-out midpoint (shadow + clip at α .5)");
  near(P(50, 200, 95), A, 3, "after the PIP ends");
  const corner = P(30, box.x, box.y), edgeMid = P(30, box.x, box.y + 45);
  const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  assert.ok(dist(corner, Bc) > 60, `corner pixel should be masked, got ${corner}`);
  near(edgeMid, Bc, 12, "left edge middle is inside the mask");
  const below = P(30, 200, box.y + box.h + 1), luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(luma(below) < luma(A) - 4, `no shadow below the PIP: ${below} vs base ${A}`);
  near(P(50, 200, box.y + box.h + 1), A, 3, "shadow gone after end");
  measured.pip = { corner, below, base: A, clip: Bc, shadowDarkening: +(luma(A) - luma(below)).toFixed(1) };
  fs.writeFileSync(path.join(W, "pip_f30.rgb"), buf.subarray(30 * 320 * 180 * 3, 31 * 320 * 180 * 3));
});

t("DIP_BLACK / FLASH: centred on the joint, duration unchanged, midpoints half-blended", () => {
  const out = { w: 320, h: 180 };
  const dip = X.dipOverlay({ baseLabel: "base", outLabel: "dip", out, jointF: 30, halfFrames: 6, kind: "DIP_BLACK" });
  const buf = graphRun("dip", `${TAGGED_BASE};${dip.graph};[dip]${RGB_709}[o]`, BASE, rawOut("o"));
  assert.equal(buf.length / (320 * 180 * 3), 60);
  const P = (b, n) => pixel(b, 320, 180, n, 160, 90);
  const A = P(buf, 5);
  near(P(buf, 23), A, 2, "before dip");
  near(P(buf, 24), A, 2, "dip frame 0 (α 0)");
  near(P(buf, 27), mix(A, [0, 0, 0], 0.5), 4, "dip in midpoint");
  near(P(buf, 30), [0, 0, 0], 3, "joint is black");
  near(P(buf, 33), mix(A, [0, 0, 0], 0.5), 4, "dip out midpoint");
  near(P(buf, 36), A, 2, "after dip");
  const fl = X.dipOverlay({ baseLabel: "base", outLabel: "fl", out, jointF: 30, halfFrames: 6, kind: "FLASH" });
  const fb = graphRun("flash", `${TAGGED_BASE};${fl.graph};[fl]${RGB_709}[o]`, BASE, rawOut("o"));
  near(P(fb, 30), mix(A, [255, 255, 255], 0.7), 5, "flash peak 70 % white");
  measured.dip = { base: A, mid: P(buf, 27), joint: P(buf, 30), flashPeak: P(fb, 30) };
});

t("logo: intro_outro enable window, opacity blend, brand colour through a bt709-tagged base", () => {
  const L = [0xe8, 0x32, 0xa8];
  const img = Buffer.alloc(40 * 40 * 3); for (let i = 0; i < 1600; i++) img.set(L, i * 3);
  fs.writeFileSync(path.join(W, "logo.png"), encodePng(40, 40, 3, img));
  const l1 = X.logoOverlay({ baseLabel: "base", outLabel: "l1", logo: { path: "logo.png" }, box: { x: 260, y: 20, w: 40 }, show: "intro_outro", totalFrames: 60, introFrames: 10, outroFrames: 10, inputIndex: 1 });
  const l2 = X.logoOverlay({ baseLabel: "l1", outLabel: "l2", logo: { path: "logo.png" }, box: { x: 20, y: 20, w: 40 }, opacity: 0.6, totalFrames: 60, inputIndex: l1.nextInputIndex });
  const buf = graphRun("logo", `${TAGGED_BASE};${l1.graph};${l2.graph};[l2]${RGB_709}[o]`, [...BASE, ...l1.inputs.flatMap(X.inputArgs), ...l2.inputs.flatMap(X.inputArgs)], rawOut("o"));
  assert.equal(buf.length / (320 * 180 * 3), 60);
  const P = (n, x, y) => pixel(buf, 320, 180, n, x, y);
  const A = P(30, 160, 90);
  const dLogo = near(P(0, 280, 40), L, 6, "logo colour frame 0");
  near(P(9, 280, 40), L, 6, "last intro frame");
  near(P(10, 280, 40), A, 3, "logo hidden after intro");
  near(P(49, 280, 40), A, 3, "hidden before outro");
  near(P(50, 280, 40), L, 6, "outro frame");
  near(P(59, 280, 40), L, 6, "last frame");
  near(P(30, 40, 40), mix(A, L, 0.6), 6, "opacity 0.6");
  measured.logo = { logoPixel: P(0, 280, 40), maxChannelErr: dLogo, opacity60: P(30, 40, 40) };
});

t("shipped masks: dims per aspect, opaque centre, transparent corner, pixels match the generator", () => {
  for (const m of allMasks()) {
    const d = decodePngFilter0(fs.readFileSync(path.join(X.PIP_MASK.dir, m.file)));
    assert.ok(d.data.equals(m.data), `${m.file} differs from generator`);
    if (m.channels === 1) {
      assert.equal(d.data[0], 0, `${m.file} corner`);
      assert.equal(d.data[Math.floor(d.h / 2) * d.w + Math.floor(d.w / 2)], 255, `${m.file} centre`);
    }
  }
  assert.throws(() => X.pipMaskFiles({ box: { w: 400, h: 300 } }), /FX_INVALID|aspect/);
});

// ---- conform ----------------------------------------------------------------------------------------------------------
section("broll/conform");
const PROJ = path.join(W, "proj");
fs.mkdirSync(path.join(PROJ, "assets", "broll"), { recursive: true });

function makeIndexedSource() {
  // 320x180 @ 25 fps, 100 frames: left half luma = 10 + 2n (frame index), right half 240.
  const w = 320, h = 180, frames = 100, raw = Buffer.alloc(w * h * frames);
  for (let n = 0; n < frames; n++) for (let y = 0; y < h; y++) {
    const o = n * w * h + y * w; raw.fill(10 + 2 * n, o, o + 160); raw.fill(240, o + 160, o + w);
  }
  fs.writeFileSync(path.join(W, "idx.gray"), raw);
  ff(["-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${w}x${h}`, "-r", "25", "-i", "idx.gray", "-f", "lavfi", "-i", "sine=d=4",
    "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(PROJ, "assets", "broll", "idx.mp4")]);
}

t("conformClip: 540x960, 30 fps, exact frames, BT.709 tags, no audio, trim by content, focus", async () => {
  makeIndexedSource();
  const asset = { assetId: "ast_px0000000000000a", path: "assets/broll/idx.mp4", type: "video" };
  const started = Date.now();
  const r = await C.conformClip(asset, { box: { w: 540, h: 960 }, durationSec: 2.5, trimInSec: 1.2, focus: { fx: 0.1, fy: 0.5 }, profile: "preview540", projectDir: PROJ });
  const ms = Date.now() - started;
  assert.equal(r.cached, false);
  assert.equal(r.totalFrames, 75);
  const j = probe(r.path, "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,pix_fmt,color_space,color_primaries,color_transfer,color_range,sample_aspect_ratio:format=duration");
  assert.equal(j.streams.length, 1, "audio must be dropped");
  const v = j.streams[0];
  assert.deepEqual([v.width, v.height, v.r_frame_rate, Number(v.nb_read_frames), v.pix_fmt], [540, 960, "30/1", 75, "yuv420p"]);
  assert.deepEqual([v.color_space, v.color_primaries, v.color_transfer, v.color_range], ["bt709", "bt709", "bt709", "tv"]);
  assert.ok(Math.abs(Number(j.format.duration) - 2.5) < 0.02, `duration ${j.format.duration}`);
  const g = ff(["-i", r.path, "-vf", "scale=in_range=tv:out_range=pc,format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const fsz = 540 * 960;
  let maxErr = 0;
  for (let k = 0; k < 75; k++) {
    let s = 0; for (let y = 400; y < 560; y += 4) for (let x = 200; x < 340; x += 4) s += g[k * fsz + y * 540 + x];
    const idx = (s / (40 * 35) - 10) / 2, expect = Math.floor((1.2 + k / 30) * 25 + 1e-6);
    maxErr = Math.max(maxErr, Math.abs(idx - expect));
    assert.ok(Math.abs(idx - expect) <= 1.01, `frame ${k}: source frame ${idx.toFixed(2)} want ${expect}`);
  }
  const right = await C.conformClip(asset, { box: { w: 540, h: 960 }, durationSec: 2.5, trimInSec: 1.2, focus: { fx: 0.9, fy: 0.5 }, profile: "preview540", projectDir: PROJ });
  const gr = ff(["-i", right.path, "-frames:v", "1", "-vf", "scale=in_range=tv:out_range=pc,format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  let s = 0; for (let i = 0; i < gr.length; i += 97) s += gr[i];
  assert.ok(s / Math.ceil(gr.length / 97) > 230, "focus right must show the bright half");
  const again = await C.conformClip(asset, { box: { w: 540, h: 960 }, durationSec: 2.5, trimInSec: 1.2, focus: { fx: 0.1, fy: 0.5 }, profile: "preview540", projectDir: PROJ });
  assert.equal(again.cached, true);
  assert.equal(again.path, r.path);
  measured.conform = { ms, maxSourceFrameErr: +maxErr.toFixed(2), crop: r.crop, tags: [v.color_space, v.color_primaries, v.color_transfer, v.color_range] };
});

t("conformClip: short source shifts trimIn; handles add head/tail frames exactly", async () => {
  const asset = { assetId: "ast_px0000000000000a", path: "assets/broll/idx.mp4" };
  const shifted = await C.conformClip(asset, { box: { w: 320, h: 180 }, durationSec: 2.5, trimInSec: 3.0, projectDir: PROJ, profile: "preview540" });
  assert.equal(shifted.trimShifted, true);
  assert.ok(Math.abs(shifted.trimInSec - 1.5) < 1e-9, `trimIn ${shifted.trimInSec}`);
  assert.equal(Number(probe(shifted.path, "stream=nb_read_frames").streams[0].nb_read_frames), 75);
  const h = await C.conformClip(asset, { box: { w: 320, h: 180 }, durationSec: 1, trimInSec: 1, projectDir: PROJ, profile: "preview540", handles: { headSec: 0.2, tailSec: 0.1 } });
  assert.deepEqual([h.headFrames, h.frames, h.tailFrames, h.totalFrames], [6, 30, 3, 39]);
  assert.equal(Number(probe(h.path, "stream=nb_read_frames").streams[0].nb_read_frames), 39);
  const g = ff(["-i", h.path, "-vf", "scale=in_range=tv:out_range=pc,format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const at = (k) => (g[k * 320 * 180 + 90 * 320 + 40] - 10) / 2;
  assert.ok(Math.abs(at(6) - 25) <= 1.01, `first visible frame shows source ${at(6)} (want 25)`);
  const sp = await C.conformClip(asset, { box: { w: 320, h: 180 }, durationSec: 1, trimInSec: 0, rate: 2, projectDir: PROJ, profile: "preview540" });
  const gs = ff(["-i", sp.path, "-vf", "scale=in_range=tv:out_range=pc,format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  assert.equal(gs.length / (320 * 180), 30);
  const last = (gs[29 * 320 * 180 + 90 * 320 + 40] - 10) / 2;
  assert.ok(Math.abs(last - 48) <= 1.5, `2× speed: frame 29 shows source ${last} (want ≈48)`);
  await assert.rejects(C.conformClip({ path: "../escape.mp4" }, { box: { w: 320, h: 180 }, durationSec: 1, projectDir: PROJ }), /PATH_ESCAPE|Invalid path/);
  await assert.rejects(C.conformClip(asset, { box: { w: 321, h: 180 }, durationSec: 1, projectDir: PROJ }), (e) => e.code === "CONFORM_INVALID");
});

t("kenBurnsStill: exact frames and tags, zoom fixed point drift ≤ 0.3 px (centre and off-centre focus)", async () => {
  ff(["-y", "-f", "lavfi", "-i", "color=c=black:s=1920x1080,drawgrid=w=40:h=40:t=2:c=white", "-frames:v", "1", path.join(PROJ, "assets", "broll", "grid.png")]);
  const img = { assetId: "ast_px0000000000000b", path: "assets/broll/grid.png", type: "image" };
  const common = { box: { w: 540, h: 960 }, durationSec: 1.5, projectDir: PROJ, profile: "export1080" };
  const row = (p) => ff(["-i", p, "-vf", "format=gray,crop=540:1:0:480", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const out = {};
  for (const fx of [0.5, 0.1]) {
    const started = Date.now();
    const kb = await C.conformClip(img, { ...common, focus: { fx, fy: 0.5 }, zoomFrom: 1, zoomTo: 1.12 });
    const ms = Date.now() - started;
    const st = await C.kenBurnsStill(img, { ...common, focus: { fx, fy: 0.5 }, zoomFrom: 1, zoomTo: 1 });
    const v = probe(kb.path, "stream=width,height,nb_read_frames,r_frame_rate,color_space,color_range").streams[0];
    assert.deepEqual([v.width, v.height, Number(v.nb_read_frames), v.r_frame_rate, v.color_space, v.color_range], [540, 960, 45, "30/1", "bt709", "tv"]);
    const zOf = (n) => 1 + 0.12 * Math.min(n / 44, 1);
    const f = fitZoom(row(kb.path), row(st.path), 540, zOf, kb.anchor.fx * 540 - 0.5);
    assert.ok(f.linesTracked >= 8, `lines ${f.linesTracked}`);
    assert.ok(f.maxDriftPx <= 0.3, `fx ${fx}: fixed-point drift ${f.maxDriftPx}`);
    assert.ok(f.maxZoomErrEdgePx <= 0.5, `fx ${fx}: zoom error ${f.maxZoomErrEdgePx}`);
    assert.ok(f.monotonic, "scale not monotonic");
    out[fx] = { anchor: kb.anchor, maxDriftPx: +f.maxDriftPx.toFixed(3), maxZoomErrEdgePx: +f.maxZoomErrEdgePx.toFixed(3), ms };
    if (process.env.KEEP_TMP) {
      ff(["-y", "-i", kb.path, "-filter_complex", "[0:v]split[a][b];[a]select=eq(n\\,0)[f0];[b]select=eq(n\\,44)[f1];[f0][f1]hstack=inputs=2", "-frames:v", "1", "-update", "1", `kb_first_last_${fx}.png`]);
    }
  }
  measured.kenBurns = out;
});

(async () => {
  const started = Date.now();
  const { failed } = await run();
  restoreFetch();
  measured.totalMs = Date.now() - started;
  console.log("MEASURED " + JSON.stringify(measured));
  if (process.env.KEEP_TMP) console.log("kept", W); else tmp.cleanup();
  process.exitCode = failed ? 1 : 0;
})();
