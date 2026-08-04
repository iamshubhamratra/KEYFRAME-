// Regression tests for the AGENT HANDOFFS — the boundaries where one agent computes
// something correctly and the next one never receives it (AGENT-AUDIT-2026-07-28 §5).
//
// Every case here FAILED before the Phase-0 fixes. They are deterministic: no network,
// no LLM, no writes outside memory (db.setFramePack on an unknown id is a no-op).
//
//   node scripts/test-agent-handoffs.js        (npm run test:handoffs)

const assert = require("node:assert");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

// A job as production actually sees it: intake has already OVERWRITTEN frame_pack with
// the brief's suggestion, and the user's real answer survives in intent.preferences.
function jobFixture({ userPick = "auto", persistedPack = null, videoTextLanguage = "en" } = {}) {
  return {
    id: "__test_job__",
    duration: 20, orientation: "horizontal", width: 1280, height: 720, fps: 30,
    frame_pack: persistedPack,
    intent: { preferences: { framePack: userPick } },
    languagePlan: {
      videoTextLanguage,
      voiceLanguage: videoTextLanguage, captionLanguage: videoTextLanguage,
      // A non-Latin plan carries a font; that is what triggers the reroute.
      font: videoTextLanguage === "en" ? null : { key: "devanagari", family: "TestDevanagari", stack: "TestDevanagari, sans-serif" },
      sourceLang: "en", dir: "ltr", mode: "localized", consistency: { synced: true, localized: true, notes: [] },
    },
  };
}

(async () => {
  console.log("\nAgent handoff regressions\n");

  // ---- C1: the Frame Selector must not read intake's guess as the user's choice ----
  const { __test } = require("../src/agents/graph");
  const frameRegistry = require("../src/services/frame_registry");
  const packs = frameRegistry.listPacks();
  const canvasPack = ["flagship", "brightlife", "terminal-departures"].find((p) => packs.includes(p));
  // A pack the frame selector has NO reason to reroute for a horizontal jobFixture: not a
  // canvas/charset pack (localization reroute) and not authored for another aspect
  // (orientation reroute). Tests that assert "the pick survives" must start from one of
  // these, otherwise they assert the absence of a guard rather than the behaviour they name.
  const neutralPack = packs.find((p) => p !== canvasPack
    && require("../src/services/frame_manifest").packFitsOrientation(p, "horizontal")) || packs[0];

  await test("frame_selector: an AUTO job reroutes off a canvas pack for non-Latin text", async () => {
    if (!canvasPack) return; // no canvas pack installed — nothing to reroute
    const s = {
      job: jobFixture({ userPick: "auto", persistedPack: canvasPack, videoTextLanguage: "hi" }),
      brief: { suggestedFramePack: canvasPack },
    };
    const out = await __test.frameSelectorAgent(s);
    assert.notStrictEqual(out.framePack, canvasPack,
      `stayed on "${canvasPack}" — intake's suggestion was read as an explicit user pick, so the localization reroute never ran`);
    assert.strictEqual(out.localizationPackWarning, null,
      "a rerouted job must not also emit the 'you chose this template' disclosure");
  });

  await test("frame_selector: an EXPLICIT canvas pick is honored, with a disclosure", async () => {
    if (!canvasPack) return;
    const s = {
      job: jobFixture({ userPick: canvasPack, persistedPack: canvasPack, videoTextLanguage: "hi" }),
      brief: { suggestedFramePack: canvasPack },
    };
    const out = await __test.frameSelectorAgent(s);
    assert.strictEqual(out.framePack, canvasPack, "the user's explicit pick must survive");
    assert.ok(out.localizationPackWarning, "an honored-but-limited pick must be disclosed");
  });

  await test("frame_selector: an AUTO job with no localization keeps the brief's suggestion", async () => {
    // The suggestion must have no OTHER reason to be rerouted, or this stops testing what it
    // says: jobFixture renders horizontal, and the first non-canvas pack alphabetically is a
    // portrait-authored one, which the orientation guard correctly swaps away from.
    const suggestion = neutralPack;
    const s = {
      job: jobFixture({ userPick: "auto", persistedPack: suggestion }),
      brief: { suggestedFramePack: suggestion },
    };
    const out = await __test.frameSelectorAgent(s);
    assert.strictEqual(out.framePack, suggestion);
  });

  await test("frame_selector: a LEGACY job (no intent.preferences) still honors frame_pack", async () => {
    const pick = neutralPack;
    const job = jobFixture({ persistedPack: pick });
    delete job.intent.preferences;               // pre-dates the preferences field
    const out = await __test.frameSelectorAgent({ job, brief: null });
    assert.strictEqual(out.framePack, pick);
  });

  // ---- H2: the storyboard's pack direction only exists if framePack is passed ----
  await test("storyboard: framePack produces the design-system direction block", () => {
    const { buildUser } = require("../src/services/storyboard");
    const withPack = buildUser({ prompt: "p", duration: 20, orientation: "horizontal", framePack: "blockframe" });
    const without = buildUser({ prompt: "p", duration: 20, orientation: "horizontal" });
    assert.ok(/blockframe/.test(withPack), "the pack name must reach the model");
    assert.ok(/visually distinct/i.test(withPack), "the adjacent-scene-variety instruction must be present");
    assert.ok(!/visually distinct/i.test(without), "control: absent without a pack");
  });

  // ---- H4: stages must report WHO served the call, or usage prices them wrong ----
  // Both models are on KIE now, so an unattributed call no longer lands on an expensive
  // OTHER PROVIDER — it lands on the stage's CONFIGURED model. The mis-pricing risk moved
  // to the in-KIE fallback: when grok-4-5 fails and gemini-3-6-flash answers the composer,
  // only the producer's returned (model, provider) can tell usage.js who actually served it.
  await test("usage: a fallback-served call is mis-priced unless the producer reports it", () => {
    const { UsageTracker } = require("../src/services/usage");
    const config = require("../src/config");
    const TOKENS = { inputTokens: 100_000, outputTokens: 10_000 };
    const cost = (extra) => {
      const t = new UsageTracker();
      t.addLlm({ ...TOKENS, stage: "composer", ...extra });
      return Number(t.computeCosts().totalCostUsd);
    };

    // (a) Pricing must actually DIFFERENTIATE models. Asserted against two explicitly named
    //     models rather than whatever `composer` happens to be routed to today — this test
    //     is about usage.priceFor, and coupling it to the routing table meant a routing
    //     change (grok-4-5 → gemini-3-6-flash for the heavy stages) broke a pricing test
    //     that had nothing to do with the change.
    const dear = cost({ model: "grok-4-5", provider: "kie" });
    const cheap = cost({ model: "gemini-3-6-flash", provider: "kie" });
    assert.ok(dear > cheap * 1.4,
      `priceFor must separate models: grok-4-5 $${dear} vs gemini-3-6-flash $${cheap}`);

    // (b) An UNATTRIBUTED call falls through to the stage's CONFIGURED model. That is the
    //     actual hazard: whenever the configured model is not the one that served the call,
    //     only the producer's returned (model, provider) can price it correctly.
    const configured = config.llm.primary?.stageModels?.composer || config.llm.primary?.model;
    assert.ok(configured, "composer must resolve to some configured model");
    assert.strictEqual(cost({}), cost({ model: configured, provider: "kie" }),
      `an unattributed call should price as the configured model (${configured})`);
  });

  await test("brief/script/storyboard/vo_fit expose model+provider in their returns", () => {
    // Static contract check: the return statements must carry the fields the callers
    // already read (tracker.addLlm({ model: res.model, provider: res.provider })).
    const fs = require("node:fs"), path = require("node:path");
    for (const [file, marker] of [
      ["brief.js", "return { brief,"],
      ["script.js", "return { script: raw,"],
      ["storyboard.js", "return { storyboard,"],
      ["vo_fit.js", "return { line:"],
    ]) {
      const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", file), "utf8");
      const line = src.split("\n").find((l) => l.includes(marker));
      assert.ok(line, `${file}: could not find the return statement (${marker})`);
      assert.ok(/model/.test(line) && /provider/.test(line),
        `${file}: its return omits model/provider, so usage.priceFor falls through to the default rate`);
    }
  });

  // ---- H6: the asset wire must carry what was already measured ----
  await test("asset wire: the graph attaches dhash + dominantColor to fetched assets", () => {
    const fs = require("node:fs"), path = require("node:path");
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "agents", "graph.js"), "utf8");
    const i = src.indexOf("const resultObj = {");
    assert.ok(i > 0, "resultObj builder not found");
    const block = src.slice(i, i + 2000);   // wide enough to clear the rationale comment
    assert.ok(/dhash:\s*r\.dhash/.test(block), "dhash is dropped at the wire");
    assert.ok(/dominantColor:\s*r\.dominantColor/.test(block),
      "dominantColor is dropped at the wire — scene_kit's palette affinity reads neutral for every asset");
  });

  await test("asset cache: a materialized hit describes the asset as fully as a download", () => {
    const localDb = require("../src/services/asset_sources/local_db");
    const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
    // materialize() only copies a file and reads the entry — call it against a temp file.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kf-cache-"));
    const srcFile = path.join(tmpDir, "src.jpg");
    fs.writeFileSync(srcFile, "not-a-real-jpeg");
    const entry = {
      file: srcFile, query: "q", type: "image", source: "pixabay",
      license: "x", sourceUrl: "u", width: 1600, height: 900,
      ratio: 1.778, hasAlpha: false, dhash: "ffffffffffffffff", dominantColor: "#204080", hits: 0,
    };
    const meta = localDb.materialize(entry, path.join(tmpDir, "out.jpg"));
    assert.strictEqual(meta.dhash, "ffffffffffffffff", "cache hit lost dhash");
    assert.strictEqual(meta.dominantColor, "#204080", "cache hit lost dominantColor");
    assert.strictEqual(meta.ratio, 1.778, "cache hit lost ratio — the layout director's device routing depends on it");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- M12: the fail-open audio path must not be louder than the planned one ----
  await test("audio_director: the default plan's SFX gain matches the sanitized default", () => {
    const { defaultAudioPlan } = require("../src/services/audio_director");
    const plan = defaultAudioPlan(
      [{ id: "s1", kind: "hook", startSec: 0, endSec: 5, voPresent: true, voWords: 8 }],
      [{ id: 0, name: "whoosh", startSec: 1 }],
      20
    );
    assert.strictEqual(plan.sfx[0].gainDb, -22,
      "the fallback mix was louder than the model-planned mix — a fallback must be more conservative, not less");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
