// Regression guard for the SHARED CUT SYSTEM (services/transition_kit.js) and its wiring into
// every om_port_kit pack.
//
// WHY THIS EXISTS. The defect this system was built to fix was invisible to every existing
// gate: all 15 modern packs performed ONE camera move on every scene of every film, and that is
// neither a lint error, a layout defect, nor a golden-hash change — the goldens were perfectly
// stable BECAUSE nothing varied. `npm test` was fully green the whole time. So the properties
// worth protecting are the ones no other test can see:
//
//   1. the edit VARIES (no adjacent repeat, no repeat within three cuts)
//   2. the variation is DETERMINISTIC (a repair lap must be comparable to the render it repairs)
//   3. packs stay DISTINCT (a shared library must not make 15 templates cut alike)
//   4. overlapping clips stay LEGAL (unique tracks) and SEEK-SAFE (hard kills)
//   5. a transition that calls a runtime helper actually ships that helper
//
// Run: npm run test:transitions

const assert = require("node:assert");
const {
  TRANSITIONS, SIGNATURES, dealTransitions, classifyBeat, xfadeFor, accentsFrom, mulberry,
} = require("../src/services/transition_kit");
const { normalizeCamera, stageOf } = require("../src/services/om_port_kit");
const { composerModuleFor } = require("../src/services/pipeline");
const frameManifest = require("../src/services/frame_manifest");

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
}

// Every pack built on om_port_kit. flight-vertical is included deliberately: it re-exports
// flight's composer at a portrait stage, so it inherits the cut system without appearing in a
// grep for buildFilm — exactly the kind of pack tooling has silently skipped before.
const KIT_PACKS = [
  "deep", "drive", "edition", "fetch", "fight", "flight", "flight-vertical", "hacker",
  "jungle", "momentum", "orbit", "pipeline", "reel", "showcase-vertical", "teampulse",
];

const STORYBOARD = {
  title: "Northwind Analytics",
  durationSec: 32,
  scenes: [
    { id: "s1", start: 0,    duration: 5,   kind: "hook",   headline: "Everything that matters", subtext: "northwind.io", purpose: "hook" },
    { id: "s2", start: 5,    duration: 4.5, kind: "bullet", headline: "One view, zero noise", body: "Fast · Clear · Live", purpose: "feature" },
    { id: "s3", start: 9.5,  duration: 4.5, kind: "bullet", headline: "Three things to notice", body: "One-click · Real-time sync · Your team", purpose: "how" },
    { id: "s4", start: 14,   duration: 4.5, kind: "stat",   headline: "12K+ teams, 99.9% uptime", purpose: "proof" },
    { id: "s5", start: 18.5, duration: 4.5, kind: "quote",  headline: "It replaced four tools", purpose: "quote" },
    { id: "s6", start: 23,   duration: 4.5, kind: "bullet", headline: "Built for scale", purpose: "feature" },
    { id: "s7", start: 27.5, duration: 4.5, kind: "cta",    headline: "Start free today", subtext: "northwind.io", purpose: "cta" },
  ],
};
const shots = (n) => Array.from({ length: n }, (_, i) => ({
  path: `assets/images/a${i}.png`, type: "image", source: i < 3 ? "website" : "upload",
  visionOk: true, cdScore: 90 - i, width: 1600, height: 900, ratio: 1.78, alt: `shot ${i}`,
}));

function buildPack(pack, n) {
  const man = frameManifest.getManifest(pack);
  const mod = composerModuleFor(man.renderer);
  assert(mod, `no composer registered for ${pack}`);
  const portrait = man.orientation === "portrait";
  return mod.buildComposition({
    storyboard: STORYBOARD,
    dims: { width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080, fps: 30 },
    captionCues: [{ start: 0, end: 3, text: "Hello" }],
    assets: shots(n), brandSkin: { accents: ["#6C5CE7"], source: "test" }, seedKey: "job-fixed",
  }).indexHtml;
}

console.log("\nTRANSITION LIBRARY\n");

ok("every transition has a unique name", () => {
  const names = TRANSITIONS.map((t) => t.name);
  assert.strictEqual(names.length, new Set(names).size, `duplicate: ${names.join(",")}`);
  assert(names.length >= 12, `only ${names.length} transitions`);
});

ok("every transition builds js, and any overlay clip is occlusion-tagged + tracked", () => {
  const acc = accentsFrom({ accent: "#6C5CE7" });
  for (const t of TRANSITIONS) {
    const piece = t.build({ o: "#s1 .om-cam", n: "#s2 .om-cam", t: 5, x: 0.46, id: "tx1", track: 20, acc, rnd: mulberry(3) });
    assert(Array.isArray(piece.js) && piece.js.length, `${t.name}: no js`);
    for (const line of piece.js) assert(/^tl\.|^burst\(/.test(line.trim()), `${t.name}: unexpected js "${line.slice(0, 50)}"`);
    if (piece.html) {
      assert(piece.html.includes("data-layout-allow-occlusion"), `${t.name}: overlay not occlusion-tagged`);
      assert(/data-track-index="20"/.test(piece.html), `${t.name}: overlay missing its track`);
    }
  }
});

ok("no transition animates a layout property", () => {
  const acc = accentsFrom({ accent: "#6C5CE7" });
  // A 1080x1920 Chromium capture re-flows on every frame if a cut animates geometry. Only
  // compositor-friendly channels are allowed through.
  const BANNED = /\b(width|height|top|left|right|bottom|margin|padding|fontSize)\s*:/;
  for (const t of TRANSITIONS) {
    const piece = t.build({ o: "#s1 .om-cam", n: "#s2 .om-cam", t: 5, x: 0.46, id: "tx1", track: 20, acc, rnd: mulberry(3) });
    for (const line of piece.js) assert(!BANNED.test(line), `${t.name} animates a layout property: ${line.slice(0, 70)}`);
  }
});

console.log("\nTHE DEALER\n");

const CLASSES = ["open", "showcase", "context", "proof", "statement", "showcase", "cta"];

ok("never repeats a cut back-to-back, and never within three cuts", () => {
  for (let seed = 1; seed < 600; seed++) {
    for (const sig of Object.keys(SIGNATURES)) {
      const names = dealTransitions({ classes: CLASSES, seed, signature: sig }).map((t) => t.name);
      for (let i = 1; i < names.length; i++) {
        assert.notStrictEqual(names[i], names[i - 1], `adjacent repeat "${names[i]}" (seed ${seed}, ${sig})`);
      }
      for (let i = 0; i < names.length; i++) {
        for (let j = Math.max(0, i - 3); j < i; j++) {
          assert.notStrictEqual(names[i], names[j], `repeat within 3 "${names[i]}" (seed ${seed}, ${sig})`);
        }
      }
    }
  }
});

ok("is deterministic — the same seed deals the same edit", () => {
  const a = dealTransitions({ classes: CLASSES, seed: 4242, signature: "cinematic" }).map((t) => t.name);
  const b = dealTransitions({ classes: CLASSES, seed: 4242, signature: "cinematic" }).map((t) => t.name);
  assert.deepStrictEqual(a, b);
});

ok("gives different jobs different edits", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    seen.add(dealTransitions({ classes: CLASSES, seed, signature: "cinematic" }).map((t) => t.name).join(">"));
  }
  assert(seen.size >= 5, `only ${seen.size} distinct edits across 12 jobs`);
});

ok("keeps pack signatures distinct", () => {
  const edits = Object.keys(SIGNATURES).map((s) =>
    dealTransitions({ classes: CLASSES, seed: 999, signature: s }).map((t) => t.name).join(">"));
  assert(new Set(edits).size >= 4, `signatures collapsed to ${new Set(edits).size} distinct edits`);
});

ok("clamps the overlap to the shorter neighbour", () => {
  assert(xfadeFor(5, 5) <= 0.46 + 1e-9, "long beats should get the full window");
  assert(xfadeFor(0.8, 5) <= 0.8 * 0.3 + 1e-9, "a short outgoing beat must shorten the cut");
  assert(xfadeFor(5, 0.6) <= 0.6 * 0.3 + 1e-9, "a short incoming beat must shorten the cut");
  assert(xfadeFor(0.1, 0.1) >= 0.12 - 1e-9, "never collapses to zero");
});

ok("classifies beats from what the film already decided", () => {
  assert.strictEqual(classifyBeat({ i: 0, total: 7, role: "hero" }), "open");
  assert.strictEqual(classifyBeat({ i: 6, total: 7, role: "outro" }), "cta");
  assert.strictEqual(classifyBeat({ i: 2, total: 7, role: "statement-c" }), "statement");
  assert.strictEqual(classifyBeat({ i: 2, total: 7, role: "band", numbers: 2 }), "proof");
  assert.strictEqual(classifyBeat({ i: 2, total: 7, role: "gallery", shotCount: 2 }), "showcase");
  assert.strictEqual(classifyBeat({ i: 2, total: 7, role: "gallery", shotCount: 0 }), "context");
});

console.log("\nTHE CAMERA UNIT BUG\n");

ok("normalizeCamera honours BOTH spellings of push", () => {
  const stage = stageOf(1920, 1080);
  // Authored pixels (11 packs) pass straight through.
  assert.strictEqual(normalizeCamera({ push: 120, scale: 1.03 }, stage).push, 120);
  // A FRACTION of the frame (drive/momentum/teampulse) becomes real pixels instead of being
  // read as 0.03px — which is what silently deleted those three packs' camera move.
  assert.strictEqual(normalizeCamera({ push: 0.03 }, stage).push, 0.03 * 1920);
  // `drift` was accepted by three packs and read by nothing.
  assert(Math.abs(normalizeCamera({ push: 0.03, drift: 0.012 }, stage).scale - 1.012) < 1e-9);
  assert.strictEqual(normalizeCamera({}, stage).push, 200);
});

console.log("\nEVERY KIT PACK\n");

for (const pack of KIT_PACKS) {
  ok(`${pack}: cuts are wired, legal and seek-safe`, () => {
    for (const n of [8, 2, 0]) {
      const html = buildPack(pack, n);

      // Unique tracks — the ONLY thing that makes overlapping clips legal.
      const tracks = [...html.matchAll(/data-track-index="(\d+)"/g)].map((m) => Number(m[1]));
      assert.strictEqual(tracks.length, new Set(tracks).size, `${pack}@${n}: duplicate track index`);

      // Clips must actually OVERLAP, or there is no window for a transition to play in.
      const clips = [...html.matchAll(/class="clip om-scene" data-start="([\d.]+)" data-duration="([\d.]+)"/g)]
        .map((m) => ({ start: Number(m[1]), dur: Number(m[2]) }));
      assert(clips.length >= 2, `${pack}@${n}: expected multiple scene clips`);
      let overlaps = 0;
      for (let i = 0; i < clips.length - 1; i++) {
        if (clips[i].start + clips[i].dur > clips[i + 1].start + 1e-6) overlaps++;
      }
      assert(overlaps >= clips.length - 2, `${pack}@${n}: only ${overlaps} overlapping cut(s) of ${clips.length - 1}`);

      // A helper referenced and never defined is a silent runtime throw that kills the whole
      // timeline — and it would still lint clean and still render (as a frozen first frame).
      if (html.includes('burst(".tx')) assert(html.includes("function burst("), `${pack}@${n}: burst() called but not defined`);

      // Seek safety: every scene hard-kills its own camera layer.
      const scenes = [...html.matchAll(/id="(s\d+)" class="clip om-scene"/g)].map((m) => m[1]);
      for (const id of scenes) {
        assert(html.includes(`tl.set("#${id} .om-cam",{opacity:0}`), `${pack}@${n}: ${id} never hard-kills .om-cam`);
      }

      // The furniture must cross-fade, or two scenes' HUDs ghost over each other mid-cut.
      assert(/\.om-hud/.test(html), `${pack}@${n}: no HUD cross-fade`);
      // The layered shell must survive: cuts and ambient drift on separate layers is the only
      // reason the two systems never fight for a property.
      assert(html.includes("om-drift") && html.includes("om-bg"), `${pack}@${n}: parallax layers missing`);
    }
  });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
