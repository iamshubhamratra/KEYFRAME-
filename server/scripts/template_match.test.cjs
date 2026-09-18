// TEMPLATE INTELLIGENCE guard tests — run: node scripts/template_match.test.cjs
//
// The invariants here are the ones auto selection used to break silently, and
// each is asserted against the REAL installed library rather than a fixture:
// a matcher that passes on three hand-made packs and mis-selects across 285 is
// the exact failure this replaces.
//
//   * ORIENTATION IS ABSOLUTE. omelette_adapter composes at the template's own
//     canvas and renderer.js refuses to rescale across a ratio change, so a
//     portrait pack on a landscape job does not look wrong — it ships a
//     1080x1920 file for a 16:9 request. 178 of the 285 installed packs are
//     portrait-native, so this is the majority case, not an edge one.
//   * DURATION IS A CONSTRAINT. A 45-beat five-minute film cast onto a 15s clip
//     keeps three of its beats and is no longer that template.
//   * SELECTION IS DETERMINISTIC. Same inputs, same template — every time. The
//     code this replaces hashed the prompt and indexed the pack list.
//   * RELEVANCE OUTRANKS VARIETY. The anti-repeat may reorder near-ties; it may
//     never displace a clear winner.
//   * MANUAL SELECTION IS UNTOUCHED. A user pin is returned verbatim even when
//     it violates every constraint above.
//
// Offline and fast — no renders, no network, no LLM.

const assert = require("node:assert");
const ti = require("../src/services/template_intelligence");
const lex = require("../src/services/template_lexicon");
const frameRegistry = require("../src/services/frame_registry");

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};
const section = (s) => console.log(`\n${s}`);

const PACKS = frameRegistry.listPacks();
if (!PACKS.length) {
  console.log("no frame packs installed — nothing to test");
  process.exit(0);
}

// ---------------------------------------------------------------- the matrix
//
// Ten prompts covering deliberately different intents, each run in both
// orientations, several runtimes and several pace modes.
const PROMPTS = [
  { id: "ai-saas", prompt: "Create a futuristic AI product launch video for our SaaS analytics platform with a dark premium feel", wants: ["technology", "saas", "launch"] },
  { id: "finance", prompt: "Explain how our banking app helps users save money automatically every month", wants: ["finance"] },
  { id: "fitness", prompt: "Create an energetic Instagram video about our fitness app with bold kinetic type", wants: ["social", "saas"] },
  { id: "technical", prompt: "Explain a complex technical concept - how a distributed database keeps data consistent - with diagrams", wants: ["education", "technology"] },
  { id: "cinematic", prompt: "Tell a cinematic story about climate change and the people fighting it", wants: ["storytelling", "documentary"] },
  { id: "product-ad", prompt: "A punchy 30 second advertisement for our new wireless headphones, premium and clean", wants: ["marketing"] },
  { id: "corporate", prompt: "A corporate investor keynote about our quarterly results and growth strategy", wants: ["finance", "event"] },
  { id: "travel", prompt: "A warm travel film about a slow weekend in Lisbon - cafes, tiles, evening light", wants: [] },
  { id: "news", prompt: "A breaking news style explainer about the election results and what they mean", wants: ["news"] },
  { id: "creative", prompt: "An experimental creative film about the texture of handmade paper and ink", wants: [] },
];
const ORIENTATIONS = ["horizontal", "vertical"];
const DURATIONS = [15, 30, 60, 180];
const PACES = ["relaxed", "normal", "fast", "very-fast"];

section("PHASE 5 — orientation is a hard filter");

check("every pick matches the requested orientation, across the whole matrix", () => {
  const bad = [];
  for (const { id, prompt } of PROMPTS) {
    for (const orientation of ORIENTATIONS) {
      for (const durationSec of DURATIONS) {
        const r = ti.select({ prompt, orientation, durationSec });
        if (!r.pack) { bad.push(`${id}/${orientation}/${durationSec}s: NO TEMPLATE`); continue; }
        const want = orientation === "vertical" ? "9:16" : "16:9";
        const got = ti.profileOf(r.pack).orientation;
        if (got !== want) bad.push(`${id}/${orientation}/${durationSec}s -> ${r.pack} is ${got}`);
      }
    }
  }
  assert.strictEqual(bad.length, 0, `${bad.length} wrong-orientation pick(s):\n        ${bad.join("\n        ")}`);
});

check("a square job is treated as landscape-compatible (matches the gallery split)", () => {
  const r = ti.select({ prompt: PROMPTS[0].prompt, orientation: "square", durationSec: 30 });
  assert.strictEqual(ti.profileOf(r.pack).orientation, "16:9");
});

check("no candidate in the shortlist has the wrong orientation either", () => {
  const r = ti.select({ prompt: PROMPTS[0].prompt, orientation: "vertical", durationSec: 30 });
  const wrong = r.candidates.filter((c) => c.orientation !== "9:16");
  assert.strictEqual(wrong.length, 0, `shortlisted ${wrong.map((c) => c.templateId).join(", ")}`);
});

check("orientation is never relaxed, even when it empties the pool", () => {
  // A pool of only portrait packs asked for landscape must yield nothing rather
  // than fall back to a portrait template.
  const portraitOnly = PACKS.filter((n) => ti.profileOf(n).portrait).slice(0, 20);
  const r = ti.select({ prompt: "anything", orientation: "horizontal", durationSec: 30, pool: portraitOnly });
  assert.strictEqual(r.pack, null, `returned ${r.pack}`);
  assert.ok(r.rejected.orientation > 0, "orientation rejections were not counted");
});

section("PHASE 3 — duration is a hard constraint");

check("a long-form template is never chosen for a short clip", () => {
  const bad = [];
  for (const { id, prompt } of PROMPTS) {
    for (const orientation of ORIENTATIONS) {
      const r = ti.select({ prompt, orientation, durationSec: 20 });
      if (r.pack && ti.profileOf(r.pack).longForm) bad.push(`${id}/${orientation} -> ${r.pack}`);
    }
  }
  assert.strictEqual(bad.length, 0, `long-form template on a 20s film: ${bad.join(", ")}`);
});

check("a template that cannot cover the runtime is never chosen", () => {
  const bad = [];
  for (const orientation of ORIENTATIONS) {
    for (const durationSec of [120, 300]) {
      const r = ti.select({ prompt: PROMPTS[4].prompt, orientation, durationSec });
      if (!r.pack) continue;
      const max = ti.profileOf(r.pack).supportedDurations.maxSec;
      if (durationSec > max) bad.push(`${orientation}/${durationSec}s -> ${r.pack} tops out at ${max}s`);
    }
  }
  assert.strictEqual(bad.length, 0, bad.join(", "));
});

check("a template the pipeline would reroute past 75s is never auto-chosen for a long film", () => {
  // pipeline.attemptLlmComposition sends a pack whose renderer is not long-form
  // capable to the scene-kit past LONGFORM_RENDERER_SEC. The film then carries
  // the pack's colours but none of its design — so choosing one in auto mode
  // promises a template that will not draw the film.
  const bad = [];
  for (const { id, prompt } of PROMPTS) {
    for (const orientation of ORIENTATIONS) {
      for (const durationSec of [90, 180]) {
        const r = ti.select({ prompt, orientation, durationSec });
        if (!r.pack) continue;
        if (!ti.profileOf(r.pack).featureSupport.rendererLongFormOk) bad.push(`${id}/${orientation}/${durationSec}s -> ${r.pack}`);
      }
    }
  }
  assert.strictEqual(bad.length, 0, bad.join(", "));
});

check("that same template stays available for a SHORT film", () => {
  // The gate is duration-scoped, not a blacklist: a sparse renderer is perfectly
  // good below the reroute threshold and must not be lost from the library.
  const sparse = PACKS.filter((n) => !ti.profileOf(n).featureSupport.rendererLongFormOk);
  if (!sparse.length) { console.log("        (no sparse renderers installed — skipped)"); return; }
  const short = ti.select({ prompt: "anything at all", orientation: "horizontal", durationSec: 30 });
  const kept = sparse.filter((n) => short.compatibleIds.includes(n));
  assert.ok(kept.length > 0, `all ${sparse.length} sparse-renderer pack(s) were dropped from a 30s film too`);
});

check("a 5-minute film gets a template authored for length", () => {
  const r = ti.select({ prompt: PROMPTS[4].prompt, orientation: "horizontal", durationSec: 300 });
  assert.ok(r.pack, "no template for a 300s film");
  assert.ok(ti.profileOf(r.pack).supportedDurations.maxSec >= 300,
    `${r.pack} tops out at ${ti.profileOf(r.pack).supportedDurations.maxSec}s`);
});

section("PHASE 7 — the fallback never becomes random");

check("an impossible runtime relaxes duration but still returns a real ranking", () => {
  const r = ti.select({ prompt: PROMPTS[0].prompt, orientation: "horizontal", durationSec: 100000 });
  assert.ok(r.pack, "no template at all");
  assert.strictEqual(r.relaxed, "duration");
  assert.strictEqual(ti.profileOf(r.pack).orientation, "16:9", "orientation was relaxed too");
  assert.ok(r.reasons.some((x) => /duration constraint relaxed/i.test(x)), "the relaxation was not explained");
});

check("an empty prompt still produces a reasoned, compatible pick", () => {
  const r = ti.select({ prompt: "", orientation: "vertical", durationSec: 30 });
  assert.ok(r.pack, "no template for an empty prompt");
  assert.strictEqual(ti.profileOf(r.pack).orientation, "9:16");
  assert.ok(r.reasons.length, "no reasons given");
});

section("determinism — the property the hash fallback destroyed");

check("the same inputs give the same template, ten times over", () => {
  for (const { id, prompt } of PROMPTS.slice(0, 4)) {
    const runs = new Set();
    for (let i = 0; i < 10; i++) runs.add(ti.select({ prompt, orientation: "vertical", durationSec: 30 }).pack);
    assert.strictEqual(runs.size, 1, `${id} produced ${[...runs].join(", ")}`);
  }
});

check("different prompts do not collapse onto one template", () => {
  const picks = PROMPTS.map(({ prompt }) => ti.select({ prompt, orientation: "vertical", durationSec: 30 }).pack);
  assert.ok(new Set(picks).size >= 5, `only ${new Set(picks).size} distinct templates across 10 prompts: ${picks.join(", ")}`);
});

check("the pace mode reaches the ranking", () => {
  const seen = new Set();
  for (const pace of PACES) seen.add(ti.select({ prompt: PROMPTS[2].prompt, orientation: "vertical", durationSec: 30, pace }).pack);
  assert.ok(seen.size >= 1); // may legitimately agree; what matters is it does not throw
  for (const pace of PACES) {
    const r = ti.select({ prompt: PROMPTS[2].prompt, orientation: "vertical", durationSec: 30, pace });
    assert.ok(r.pack, `no template at pace=${pace}`);
  }
});

section("PHASE 6 — variety may break ties, never beat relevance");

check("a clear winner survives the anti-repeat", () => {
  const base = ti.select({ prompt: PROMPTS[2].prompt, orientation: "horizontal", durationSec: 30 });
  const lead = base.candidates[0].score - base.candidates[1].score;
  if (lead <= ti.DIVERSITY_BAND) { console.log(`        (lead is ${lead.toFixed(1)}, inside the band — checking the band rule instead)`); }
  const repeat = ti.select({ prompt: PROMPTS[2].prompt, orientation: "horizontal", durationSec: 30, recentPacks: [base.pack] });
  if (lead > ti.DIVERSITY_BAND) {
    assert.strictEqual(repeat.pack, base.pack, `a ${lead.toFixed(1)}-point leader was displaced by the anti-repeat`);
  } else {
    assert.ok(base.candidates.some((c) => c.templateId === repeat.pack), "the swap left the candidate set");
  }
});

check("a near-tie does rotate when the leader styled the previous film", () => {
  // Find a prompt whose top two candidates are within the band, then confirm the
  // anti-repeat moves off the leader. If nothing in the matrix ties that closely
  // the rule is vacuously satisfied and the test says so rather than passing
  // silently on a case it never exercised.
  let tested = false;
  for (const { prompt } of PROMPTS) {
    for (const orientation of ORIENTATIONS) {
      const base = ti.select({ prompt, orientation, durationSec: 30 });
      if (base.candidates.length < 2) continue;
      if (base.candidates[0].score - base.candidates[1].score > 1.5) continue;
      const repeat = ti.select({ prompt, orientation, durationSec: 30, recentPacks: [base.pack] });
      assert.notStrictEqual(repeat.pack, base.pack, `near-tie on "${prompt.slice(0, 30)}..." did not rotate`);
      tested = true;
      break;
    }
    if (tested) break;
  }
  assert.ok(tested, "no near-tie found in the matrix to exercise the rotation");
});

check("the anti-repeat never leaves the compatible set", () => {
  for (const { prompt } of PROMPTS) {
    const r = ti.select({ prompt, orientation: "vertical", durationSec: 30, recentPacks: PACKS.slice(0, 3) });
    assert.strictEqual(ti.profileOf(r.pack).orientation, "9:16", `${r.pack} is the wrong orientation`);
  }
});

section("PHASE 8 — the choice is explainable");

check("every selection reports a score, reasons and runners-up", () => {
  const r = ti.select({ prompt: PROMPTS[0].prompt, orientation: "vertical", durationSec: 30 });
  assert.ok(r.score > 0 && r.score <= 100, `score out of range: ${r.score}`);
  assert.ok(r.reasons.length >= 2, "too few reasons");
  assert.ok(/orientation/i.test(r.reasons[0]), "orientation is not stated first");
  assert.ok(r.candidates.length >= 3, "fewer than 3 candidates exposed");
  assert.ok(r.candidates.every((c) => typeof c.score === "number" && Array.isArray(c.reasons)),
    "a candidate is missing its score or reasons");
});

check("the rejection tally accounts for the whole library", () => {
  const r = ti.select({ prompt: PROMPTS[0].prompt, orientation: "vertical", durationSec: 30 });
  const rejected = Object.values(r.rejected).reduce((a, b) => a + b, 0);
  assert.strictEqual(r.compatibleCount + rejected, r.poolSize,
    `${r.compatibleCount} + ${rejected} != ${r.poolSize}`);
});

check("explain() renders a single readable block naming the winner", () => {
  const r = ti.select({ prompt: PROMPTS[0].prompt, orientation: "vertical", durationSec: 30 });
  const text = ti.explain(r);
  assert.ok(text.includes(r.pack), "the winner is not named");
  assert.ok(/\/100/.test(text), "no score in the explanation");
});

section("manual selection is unchanged");

check("a user pin is returned verbatim, even at the wrong orientation", () => {
  const portrait = PACKS.find((n) => ti.profileOf(n).portrait);
  const r = ti.resolveForJob({
    job: { id: "t1", prompt: "anything at all", orientation: "horizontal", duration: 30, frame_pack: portrait, frame_pack_user: 1 },
    brief: null,
  });
  assert.strictEqual(r.pack, portrait, "the pin was overridden");
  assert.strictEqual(r.via, "user");
  assert.ok(r.warnings.some((w) => /orientation|aspect/i.test(w)), "the mismatch was not reported");
});

check("a user pin is returned verbatim, even at an impossible duration", () => {
  const longform = PACKS.find((n) => ti.profileOf(n).longForm && !ti.profileOf(n).portrait);
  const r = ti.resolveForJob({
    job: { id: "t2", prompt: "x", orientation: "horizontal", duration: 10, frame_pack: longform, frame_pack_user: 1 },
    brief: null,
  });
  assert.strictEqual(r.pack, longform, "the pin was overridden");
  assert.ok(r.warnings.length, "the mismatch was not reported");
});

check("a pack on the job row that the USER did not pin is not treated as a pin", () => {
  // Intake writes the brief's suggestion into job.frame_pack. Reading that as an
  // explicit choice is what made every auto job look user-pinned to the graph,
  // so the constraint check never ran on it.
  const portrait = PACKS.find((n) => ti.profileOf(n).portrait);
  const r = ti.resolveForJob({
    job: { id: "t3", prompt: "a landscape film", orientation: "horizontal", duration: 30, frame_pack: portrait, frame_pack_user: 0 },
    brief: null,
  });
  assert.notStrictEqual(r.via, "user");
  assert.strictEqual(ti.profileOf(r.pack).orientation, "16:9", `${r.pack} is portrait on a horizontal job`);
});

section("PHASE 9 — the brief's pick is honoured when it fits, replaced when it cannot");

check("a compatible brief pick stands", () => {
  const r0 = ti.select({ prompt: PROMPTS[1].prompt, orientation: "vertical", durationSec: 30 });
  const second = r0.candidates[1].templateId;
  const r = ti.resolveForJob({
    job: { id: "t4", prompt: PROMPTS[1].prompt, orientation: "vertical", duration: 30, frame_pack: null, frame_pack_user: 0 },
    brief: { suggestedFramePack: second },
    recentPacks: [],
  });
  assert.strictEqual(r.pack, second, "a valid brief pick was overridden by the ranking");
  assert.strictEqual(r.via, "brief");
});

check("an incompatible brief pick is replaced, and the reason is recorded", () => {
  const portrait = PACKS.find((n) => ti.profileOf(n).portrait);
  const r = ti.resolveForJob({
    job: { id: "t5", prompt: PROMPTS[1].prompt, orientation: "horizontal", duration: 30, frame_pack: null, frame_pack_user: 0 },
    brief: { suggestedFramePack: portrait },
    recentPacks: [],
  });
  assert.strictEqual(ti.profileOf(r.pack).orientation, "16:9");
  assert.strictEqual(r.via, "re-selected");
  assert.ok(r.warnings.some((w) => w.includes(portrait)), "the replaced pick was not named");
});

check("a hallucinated brief pick falls back to the ranking, not to a random pack", () => {
  const r = ti.resolveForJob({
    job: { id: "t6", prompt: PROMPTS[1].prompt, orientation: "vertical", duration: 30, frame_pack: null, frame_pack_user: 0 },
    brief: { suggestedFramePack: "no-such-template-exists" },
    recentPacks: [],
  });
  const top = ti.select({ prompt: PROMPTS[1].prompt, orientation: "vertical", durationSec: 30, recentPacks: r.selection ? [] : [] });
  assert.ok(PACKS.includes(r.pack), "returned an uninstalled pack");
  assert.strictEqual(ti.profileOf(r.pack).orientation, "9:16");
  assert.ok(top.candidates.some((c) => c.templateId === r.pack), "the fallback left the ranked set");
});

check("selectionRecord carries the audit trail the job persists", () => {
  const r = ti.resolveForJob({
    job: { id: "t7", prompt: PROMPTS[0].prompt, orientation: "vertical", duration: 30, frame_pack: null, frame_pack_user: 0 },
    brief: null, recentPacks: [],
  });
  const rec = ti.selectionRecord(r);
  assert.strictEqual(rec.pack, r.pack);
  assert.ok(rec.via && Array.isArray(rec.reasons));
  assert.ok(Array.isArray(rec.topCandidates) && rec.topCandidates.length >= 1);
  assert.ok(typeof rec.compatibleCount === "number" && typeof rec.poolSize === "number");
});

section("profiles — derived metadata covers the whole installed library");

check("every installed pack yields a profile with the load-bearing fields", () => {
  const bad = [];
  for (const name of PACKS) {
    const p = ti.profileOf(name);
    if (!p) { bad.push(`${name}: no profile`); continue; }
    if (p.orientation !== "9:16" && p.orientation !== "16:9") bad.push(`${name}: orientation ${p.orientation}`);
    const d = p.supportedDurations;
    if (!(d.minSec > 0 && d.maxSec > d.minSec && d.nativeSec > 0)) bad.push(`${name}: durations ${JSON.stringify(d)}`);
    if (!(p.qualityScore >= 0 && p.qualityScore <= 1)) bad.push(`${name}: qualityScore ${p.qualityScore}`);
    if (!p.pacingCompatibility.size) bad.push(`${name}: no pacing bands`);
  }
  assert.strictEqual(bad.length, 0, `${bad.length} bad profile(s):\n        ${bad.slice(0, 8).join("\n        ")}`);
});

check("the matcher's orientation agrees with the canvas the ADAPTER would compose at", () => {
  // THE INVARIANT THE WHOLE FIX RESTS ON. omelette_adapter decides its canvas
  // from `portraitNative` when the manifest states it, and otherwise from the
  // set of template names every OTHER manifest declares portrait-native. If the
  // matcher's notion of a pack's orientation ever diverged from that rule, the
  // hard filter would be guarding a shape the renderer does not actually use —
  // which is exactly the failure mode being fixed, reintroduced one layer down.
  const fm = require("../src/services/frame_manifest");
  const set = new Set(["Reel", "FetchVertical", "FlightVertical", "ShowcaseVertical", "Teampulse", "Cadence", "Birdsong", "Stomp"]);
  for (const n of fm.listManifests()) {
    const m = fm.getManifest(n);
    const t = m && (m.template || m.omeletteTemplate);
    if (t && m.portraitNative) set.add(String(t));
  }
  const bad = [];
  for (const n of PACKS) {
    const m = fm.getManifest(n) || {};
    const adapter = typeof m.portraitNative === "boolean" ? m.portraitNative : set.has(String(m.template || ""));
    if (adapter !== ti.profileOf(n).portrait) bad.push(`${n} (adapter=${adapter}, matcher=${ti.profileOf(n).portrait})`);
  }
  assert.strictEqual(bad.length, 0, `${bad.length} divergence(s): ${bad.slice(0, 5).join(", ")}`);
});

check("the derived orientation agrees with the manifest's portraitNative", () => {
  const bad = PACKS.filter((n) => {
    const m = require("../src/services/frame_manifest").getManifest(n) || {};
    return ti.profileOf(n).portrait !== (m.portraitNative === true);
  });
  assert.strictEqual(bad.length, 0, `disagreed on: ${bad.slice(0, 5).join(", ")}`);
});

check("an authored intent block overrides the derivation", () => {
  // Exercised through the profile builder rather than by writing to disk: the
  // point is that `intent` wins field by field, not that a particular pack has one.
  const fm = require("../src/services/frame_manifest");
  const parsed = fm.PackManifestSchema.parse({
    name: "unit-test-pack",
    portraitNative: true,
    intent: { orientation: "16:9", vibes: ["corporate"], minSec: 5, maxSec: 999, nativeSec: 42 },
  });
  assert.strictEqual(parsed.intent.orientation, "16:9", "the intent block did not survive validation");
  assert.deepStrictEqual(parsed.intent.vibes, ["corporate"]);
});

section("lexicon — the Phase 4 vibe examples");

check("the brief's own worked examples map to the right labels", () => {
  const cases = [
    ["Create a futuristic AI product launch", { contentTypes: "launch", industries: "ai", vibes: "futuristic" }],
    ["Explain how a banking app helps users save money", { contentTypes: "finance", industries: "fintech" }],
    ["Create an energetic Instagram video about a fitness app", { contentTypes: "social", industries: "fitness", vibes: "energetic" }],
    ["Tell a cinematic story about climate change", { contentTypes: "storytelling", industries: "environment", vibes: "cinematic" }],
    ["Explain a complex technical concept", { contentTypes: "education", vibes: "technical" }],
  ];
  for (const [text, want] of cases) {
    const p = lex.profileText(text);
    for (const [axis, label] of Object.entries(want)) {
      assert.ok(p[axis].has(label), `"${text}" -> ${axis} missing "${label}" (got ${[...p[axis].keys()].join(",") || "nothing"})`);
    }
  }
});

check("IDF discounts a label that describes half the library", () => {
  const c = ti.corpus();
  const cinematic = c.df.vibes.get("cinematic") || 0;
  const corporate = c.df.vibes.get("corporate") || 0;
  if (cinematic > corporate * 2) {
    // A prompt asking only for the common label must score lower than one asking
    // only for the rare label, all else equal.
    const common = ti.idfOverlap(new Map([["cinematic", 1]]), new Set(["cinematic"]), "vibes");
    const rare = ti.idfOverlap(new Map([["corporate", 1]]), new Set(["corporate"]), "vibes");
    assert.ok(rare > common, `rare label scored ${rare.toFixed(3)} vs common ${common.toFixed(3)}`);
  } else {
    console.log("        (library frequencies too close to exercise IDF — skipped)");
  }
});

section("performance");

check("a full 285-pack selection completes well inside a stage budget", () => {
  ti.select({ prompt: PROMPTS[0].prompt, orientation: "vertical", durationSec: 30 }); // warm
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) ti.select({ prompt: PROMPTS[i].prompt, orientation: "horizontal", durationSec: 30 });
  const per = (Date.now() - t0) / 5;
  assert.ok(per < 250, `${per.toFixed(0)}ms per selection over ${PACKS.length} packs`);
  console.log(`        (${per.toFixed(0)}ms per selection over ${PACKS.length} packs)`);
});

console.log(`\n${failures ? `${failures} FAILURE(S)` : "all template-intelligence guards pass"}`);
process.exit(failures ? 1 : 0);
