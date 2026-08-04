// CONTENT FLOOR + BACKGROUND TIER — the two High items from the 9:16 quality audit.
// Replayed against the copy and asset shapes the real films actually produced.
//
//   node scripts/test-content-floor.js        (npm run test:content)

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-floor-"));
const config = require("../src/config");
config.paths.dbFile = path.join(TMP, "jobs.json");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

const { normalizeScript } = require("../src/services/script");
const { injectSceneBackdrops } = require("../src/services/scene_backdrop");

const mkScript = (scenes) => ({
  title: "T", music: { mood: "m", query: "q" }, voice: { style: "s", pace: "p" },
  scenes: scenes.map((s, i) => ({
    id: `s${i + 1}`, start: i * 4, duration: 4, purpose: s.purpose || "feature",
    voiceover: s.vo || "", onScreenText: s.ost || [], visualDirection: "x", musicCue: "up", assetNeeds: [], sfx: [],
  })),
});
const words = (sc) => (sc.onScreenText || []).join(" ").split(/\s+/).filter(Boolean).length;

console.log("\nContent floor + background tier\n");

// ---- content floor --------------------------------------------------------
test("a bare headline gains a supporting line drawn from its voiceover", () => {
  // The exact shape from 755o2m8g21: one two-word line, substance only in the VO.
  const out = normalizeScript(mkScript([
    { ost: ["Meet Claude"], vo: "Meet Claude, built by Anthropic for the frontier.", purpose: "feature" },
  ]), { targetDuration: 4 });
  const sc = out.scenes[0];
  assert.strictEqual(sc.onScreenText.length, 2, `expected a supporting line, got ${JSON.stringify(sc.onScreenText)}`);
  assert.ok(words(sc) > 2, "the scene should carry more than the bare headline");
  assert.notStrictEqual(sc.onScreenText[1].toLowerCase(), "meet claude", "the support must not echo the headline");
});

test("the support prefers the SECOND sentence — the first usually restates the headline", () => {
  const out = normalizeScript(mkScript([
    { ost: ["Ship faster"], vo: "Ship faster. From idea to production in a single day.", purpose: "feature" },
  ]), { targetDuration: 4 });
  assert.match(out.scenes[0].onScreenText[1], /idea to production/i);
});

test("copy the model already wrote is never rewritten", () => {
  const authored = ["99.99% uptime", "Backed by a global edge network"];
  const out = normalizeScript(mkScript([{ ost: authored, vo: "Some other narration entirely.", purpose: "proof" }]), { targetDuration: 4 });
  assert.deepStrictEqual(out.scenes[0].onScreenText, authored);
});

test("a one-word or echoing voiceover yields nothing rather than junk", () => {
  const echo = normalizeScript(mkScript([{ ost: ["Start today"], vo: "Start today.", purpose: "cta" }]), { targetDuration: 4 });
  assert.strictEqual(echo.scenes[0].onScreenText.length, 1, "an echo must not become a second line");
  const bare = normalizeScript(mkScript([{ ost: ["Hello"], vo: "Go.", purpose: "cta" }]), { targetDuration: 4 });
  assert.strictEqual(bare.scenes[0].onScreenText.length, 1, "a one-word VO is not support");
});

test("a long voiceover is trimmed to a readable phrase, not chopped mid-word", () => {
  const out = normalizeScript(mkScript([{
    ost: ["Steerable Systems"],
    vo: "Complex professional tasks demand reliable, steerable systems that teams can actually trust in production.",
    purpose: "context",
  }]), { targetDuration: 4 });
  const support = out.scenes[0].onScreenText[1];
  assert.ok(support.length <= 64, `support too long: ${support.length}`);
  assert.ok(!/\s$/.test(support) && !support.endsWith(","), "should not end on a dangling separator");
  assert.ok(support.split(/\s+/).length >= 2);
});

test("replays 755o2m8g21's copy: every scene ends up with real support", () => {
  const real = [
    { ost: ["Reliable AI", "Built for Trust"], vo: "How do we build AI we can actually trust?", purpose: "hook" },
    { ost: ["Steerable Systems"], vo: "Complex professional tasks demand reliable, steerable systems.", purpose: "context" },
    { ost: ["Meet Claude"], vo: "Meet Claude, built by Anthropic for the frontier.", purpose: "feature" },
    { ost: ["Public Benefit", "Corporation"], vo: "As a public benefit corporation, our mission is safety.", purpose: "proof" },
  ];
  const out = normalizeScript(mkScript(real), { targetDuration: 16 });
  const singles = out.scenes.filter((s) => (s.onScreenText || []).length < 2);
  assert.strictEqual(singles.length, 0, `still bare: ${JSON.stringify(singles.map((s) => s.onScreenText))}`);
});

// ---- background tier ------------------------------------------------------
const CLIP = (id, inner) => `<div class="clip om-sc" id="${id}" data-start="0" data-duration="4" data-track-index="2" style="opacity:0;">${inner}</div>`;
const asset = (p, sceneId, extra = {}) => ({ path: p, type: "image", sceneId, source: "website-asset", ...extra });

test("an empty scene gets a backdrop from imagery the composer discarded", () => {
  const html = `<body>${CLIP("s1", '<img src="assets/images/site_0.png">')}${CLIP("s2", "<h1>Text only</h1>")}</body>`;
  const assets = [asset("assets/images/site_0.png", "s1"), asset("ingest/brand_assets/a9.png", "s2")];
  const r = injectSceneBackdrops({ indexHtml: html, assets, storyboard: { scenes: [{ id: "s1" }, { id: "s2" }] } });
  assert.strictEqual(r.injected.length, 1, "the empty scene should be backdropped");
  assert.strictEqual(r.injected[0].sceneId, "s2");
  assert.ok(r.html.includes("ingest/brand_assets/a9.png"), "the discarded asset now appears in the document");
  assert.ok(r.html.includes("kf-scene-backdrop"));
});

test("a scene that already shows an asset is left alone", () => {
  const html = `<body>${CLIP("s1", '<img src="assets/images/site_0.png">')}</body>`;
  const r = injectSceneBackdrops({ indexHtml: html, assets: [asset("assets/images/site_0.png", "s1")], storyboard: { scenes: [{ id: "s1" }] } });
  assert.strictEqual(r.injected.length, 0);
  assert.strictEqual(r.html, html, "the composition must be untouched");
});

test("the backdrop sits behind content and is exempt from the occlusion gate", () => {
  const html = `<body>${CLIP("s1", "<h1>Only text</h1>")}</body>`;
  const r = injectSceneBackdrops({ indexHtml: html, assets: [asset("a.png", "s1")], storyboard: { scenes: [{ id: "s1" }] } });
  const idx = r.html.indexOf("kf-scene-backdrop"), h1 = r.html.indexOf("<h1>");
  assert.ok(idx > 0 && idx < h1, "the backdrop must precede the content in DOM order (painted behind)");
  assert.ok(/z-index:0/.test(r.html) && /data-layout-allow-occlusion/.test(r.html));
  assert.ok(/opacity:0\.\d+/.test(r.html), "it must be a quiet wash, not a second hero");
});

test("logos, vectors and video are never used as backdrops", () => {
  const html = `<body>${CLIP("s1", "<h1>t</h1>")}${CLIP("s2", "<h1>t</h1>")}${CLIP("s3", "<h1>t</h1>")}</body>`;
  const assets = [
    asset("uploads/logo.png", "s1", { role: "logo" }),
    asset("icons/x.svg", "s2"),
    asset("clips/b.mp4", "s3", { type: "video" }),
  ];
  const r = injectSceneBackdrops({ indexHtml: html, assets, storyboard: { scenes: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] } });
  assert.strictEqual(r.injected.length, 0, `nothing here is backdrop material, got ${JSON.stringify(r.injected)}`);
});

test("the same asset is never used twice, and malformed input is a no-op", () => {
  const html = `<body>${CLIP("s1", "<h1>a</h1>")}${CLIP("s2", "<h1>b</h1>")}</body>`;
  const r = injectSceneBackdrops({ indexHtml: html, assets: [asset("only.png", "s1")], storyboard: { scenes: [{ id: "s1" }, { id: "s2" }] } });
  assert.strictEqual(r.injected.length, 1, "one asset can only cover one scene");
  assert.doesNotThrow(() => injectSceneBackdrops({}));
  assert.strictEqual(injectSceneBackdrops({ indexHtml: "<body></body>", assets: [asset("a.png", "s1")] }).injected.length, 0);
});


// ---- portrait layout ------------------------------------------------------
test('portrait text safety wraps long copy instead of letting it leave the frame', () => {
  const { injectPortraitTextSafety } = require('../src/services/scene_backdrop');
  const html = '<html><head><style>.clip{position:absolute}</style></head><body>' + CLIP('s1','<h1>Averyverylongproductnamethatcannotbreak</h1>') + '</body></html>';
  const land = injectPortraitTextSafety({ indexHtml: html, dims: { width: 1280, height: 720 } });
  assert.strictEqual(land.applied, false, 'landscape has room — leave it alone');
  const port = injectPortraitTextSafety({ indexHtml: html, dims: { width: 720, height: 1280 } });
  assert.ok(port.applied, 'portrait should gain the safety layer');
  assert.match(port.html, /overflow-wrap: anywhere/);
  assert.ok(port.html.indexOf('portrait text safety') < port.html.lastIndexOf('</style>'), 'must land inside a stylesheet');
  const twice = injectPortraitTextSafety({ indexHtml: port.html, dims: { width: 720, height: 1280 } });
  assert.strictEqual(twice.applied, false, 'must not stack on re-entry');
});

test('portrait headlines fill more of the tall frame than landscape', () => {
  const c = require('../src/services/motion_canvas_composer');
  const sc = (id, h, i) => ({ id, start: i * 4, duration: 4, kind: 'bullet', purpose: 'feature', headline: h, subtext: 's', onScreenText: [h, 's'], voiceover: h });
  const SB = { title: 'A', durationSec: 8, scenes: [sc('s1', 'Ship faster', 0), sc('s2', 'Built for teams', 1)] };
  const big = (html) => Math.max(...[...html.matchAll(/font-size:([\d.]+)cqw/g)].map((m) => parseFloat(m[1])));
  const land = big(c.buildComposition({ storyboard: SB, dims: { width: 1280, height: 720, fps: 30 }, framePack: 'motion-canvas', assets: [], captionCues: [], seedKey: 't' }).indexHtml);
  const port = big(c.buildComposition({ storyboard: SB, dims: { width: 720, height: 1280, fps: 30 }, framePack: 'motion-canvas', assets: [], captionCues: [], seedKey: 't' }).indexHtml);
  assert.ok(port > land, `portrait headline (${port}) should exceed landscape (${land})`);
  assert.ok(port / land < 1.35, 'but not so much that it overflows the column');
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
