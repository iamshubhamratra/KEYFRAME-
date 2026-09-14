#!/usr/bin/env node
// DOES A BEAT SHOW THE PICTURE IT PAID FOR?  —  run: npm run audit:beatmatch
//
// The complaint this serves is "the assets don't match the script". Relevance
// (asset_relevance.test.cjs) answers "did we FETCH the right picture"; this
// answers the second half — "did the right picture reach the right BEAT". They
// are separate failures with separate causes, and a film can fail the second
// while passing the first: the planner buys a photo FOR scene 4, the adapter
// drops it on scene 7, and scene 4 shows a photo bought for scene 2. Everything
// downstream (density, coverage, QA) counts that film as fully dressed.
//
// WHAT MAKES THE NUMBER HONEST — two things the earlier hand-measurement of this
// got wrong, both of which manufacture failures that are not there:
//
//   1. A SCENE WITH NO PICTURE OF ITS OWN HAS NO CHOICE but to show someone
//      else's. At a 6-picture supply over 9 scenes, three MUST borrow. That is
//      arithmetic, not a defect, and counting it is what made the old
//      "74% wrong-beat" figure unactionable. Those scenes are reported
//      separately and never scored.
//   2. A BEAT IS NOT A SCENE. The pace splitter cuts one narrated scene into two
//      or more template beats — nine scenes became eighteen beats on teampulse —
//      so comparing beat[i] to scene[i] is off by a growing offset. An early
//      draft of this file did exactly that and "found" a 54% defect rate that
//      was entirely its own indexing. Beats are traced back to their scene by
//      the scene copy they carry (see beatOwner).
//
// So each SCENE that owns a picture — the narration unit, since the voiceover is
// synthesized per scene and plays across every beat it was cut into — is scored
// once:
//
//   shows it        — its own picture reached at least one of its beats
//   shows OTHERS'   — its beats drew pictures, none of them its own. THE DEFECT.
//   shows nothing   — a picture was bought for it and never drawn anywhere.
//   drawn, untraced — its picture is in the film, on a beat carrying no scene
//                     copy (a Reveal that prints only the brand). A limit of the
//                     tracing, reported apart from the verdict rather than
//                     charged to the pipeline as a miss.
//
// No render, no browser: it casts through the real adapter and reads the
// OM_SCENES payload the adapter itself emits, so it is fast enough to sweep the
// whole pack library on every change to the casting code.
//
// BASELINE, 2026-09-07, all 197 omelette packs: 0 defects at supply 3, 6 and 9,
// and with 2 or 4 of the pictures as real site captures. The own-beat bonus in
// omelette_adapter's matchScore is what holds this at zero — change that scoring
// and run this before believing it is still fine.
//
//   node scripts/audit-beat-match.js                 # 40-pack sample
//   node scripts/audit-beat-match.js --all           # every omelette pack
//   node scripts/audit-beat-match.js --packs a,b,c   # named packs
//   node scripts/audit-beat-match.js --supply 9      # pictures bought (default 6)
//   node scripts/audit-beat-match.js --shots 2       # how many are site captures
//   node scripts/audit-beat-match.js --trace         # per-beat owner + draws

const fs = require("node:fs");
const path = require("node:path");
const om = require("../src/services/omelette_adapter.js");

const ROOT = path.resolve(__dirname, "..", "..");
const FRAMES = path.join(ROOT, "frames");

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const ALL = argv.includes("--all");
const SUPPLY = Number(flag("supply", 6));
const NAMED = flag("packs", null);
const SAMPLE = Number(flag("sample", 40));
const VERBOSE = argv.includes("--verbose");
// How many of the bought pictures are REAL WEBSITE CAPTURES rather than stock.
// This is the shape of a website film, and it is the shape the adapter's own
// comments flag as dangerous: a capture is allowed to outrank a beat's pinned
// photo (a stock photo inside a browser frame is wrong by construction), and an
// unqualified version of that borrow once drew the same two captures for a whole
// film while the four photographs the job paid for went undrawn.
const SHOTS = Number(flag("shots", 0));
const TRACE = argv.includes("--trace");

// ---- the fixture film -------------------------------------------------------
// Nine scenes, each with its OWN vocabulary, because the failure mode being
// measured is a cast that falls back on word overlap: if every scene talked about
// the same things, a foreign picture would be a defensible choice and the audit
// would be measuring nothing. Each scene names objects no other scene names.
// `marks` are tokens that appear in this scene's copy and in NO other scene's —
// it is how a beat is traced back to the scene it came from (see beatOwner). It
// has to be a real word from the film's own vocabulary, not a sentinel, because
// the same copy is what the cast scores against.
const SCENES = [
  { id: "s1", kind: "hook", purpose: "hook", marks: ["receipts", "crumpled"], headline: "Receipts everywhere", subtext: "Crumpled paper piles on the desk.", voiceover: "Crumpled receipts pile up on the desk faster than you can file them.", query: "crumpled paper receipts desk" },
  { id: "s2", kind: "problem", purpose: "problem", marks: ["sorting", "evening"], headline: "Sorting eats the evening", subtext: "Manual entry drags on.", voiceover: "Sorting them by hand eats an entire evening, manually, every single month.", query: "tired person late evening paperwork" },
  { id: "s3", kind: "feature", purpose: "feature", marks: ["snap", "camera"], headline: "Snap one photo", subtext: "The camera does the reading.", voiceover: "Snap a photo and the camera reads every line for you.", query: "hand camera photograph closeup" },
  { id: "s4", kind: "feature", purpose: "feature", marks: ["filed", "categories"], headline: "Filed automatically", subtext: "Categories assign themselves.", voiceover: "Each expense is filed into the right categories the moment it lands.", query: "filing cabinet folders labels" },
  { id: "s5", kind: "demo", purpose: "demo", marks: ["board", "glance"], headline: "One board, one glance", subtext: "The board holds the month.", voiceover: "One board shows the whole month at a glance.", query: "planning board wall charts" },
  { id: "s6", kind: "proof", purpose: "proof", marks: ["finance", "switched"], headline: "Finance teams switched", subtext: "Finance leads, on the record.", voiceover: "Finance leads at forty companies switched over this year.", query: "smiling finance manager portrait office" },
  { id: "s7", kind: "stat", purpose: "stat", marks: ["hours", "handed"], headline: "Six hours handed back", subtext: "Six hours, per person.", voiceover: "That is six hours handed straight back to your people.", query: "runner track stopwatch sprint" },
  { id: "s8", kind: "feature", purpose: "feature", marks: ["tax", "accountant"], headline: "Tax-ready exports", subtext: "One click to your accountant.", voiceover: "Everything exports tax ready for your accountant in a single click.", query: "accountant handshake documents signing" },
  { id: "s9", kind: "cta", purpose: "cta", marks: ["today", "sunrise"], headline: "Start today", subtext: "A sunrise, and a free trial.", cta: "Start today free", voiceover: "Start today at sunrise. It is free to try.", query: "sunrise open road horizon" },
];
const DUR = 5;
const storyboardOf = () => ({
  title: "Tully", brand: "Tully", url: "tully.com",
  durationSec: SCENES.length * DUR,
  scenes: SCENES.map((s, i) => ({ ...s, start: i * DUR, duration: DUR, bullets: [] })),
});

// The planner's own spread: with a budget smaller than the scene count it buys
// for scenes spread ACROSS the film (byScenePriority), not for the first N. The
// beats it skips are the ones legitimately entitled to borrow.
function ownersFor(supply) {
  const n = SCENES.length;
  if (supply >= n) return SCENES.map((s) => s.id);
  const step = n / supply;
  return Array.from({ length: supply }, (_, k) => SCENES[Math.min(n - 1, Math.round(k * step))].id);
}

// Each asset's alt text is ITS OWN scene's vocabulary — the cast can always find
// the right home by words alone, so a miss is a cast decision, never a lack of
// signal. Pixel dimensions are the delivered 1280 rung (see pixabay_api).
function assetsFor(supply) {
  return ownersFor(supply).map((sid, i) => {
    const sc = SCENES.find((s) => s.id === sid);
    return {
      path: `assets/images/${i}.jpg`, type: "image", source: "pixabay",
      sceneId: sid, width: 1280, height: 853, ratio: 1.5,
      // The planner derives the search string from the scene's own words, so the
      // asset carries a real link back to its beat; `alt` is provider tag soup,
      // which is what makes word overlap a weak signal in a live film.
      query: sc.query, alt: "stock photo image background",
      cdScore: 70, cdProminence: "support", visionOk: true,
      // The first SHOTS assets become real site captures, pinned to their beat
      // exactly as the screenshot director pins them.
      ...(i < SHOTS ? { source: "website", kind: "screenshot", sectionType: "features", width: 2732, height: 1800, ratio: 1.518, alt: "REAL screenshot of the product", cdProminence: "hero", cdScore: 88 } : {}),
    };
  });
}

// ---- read the cast back out of the adapter's own payload --------------------
// buildComposition writes `window.OM_SCENES = <json>;` — the literal list the
// bundled engine renders. Beat i of that list is scene i of the storyboard (the
// adapter's own mediaPlan asserts the same mapping), so the payload is the
// ground truth for "what did this beat end up showing".
function castOf(html) {
  // The scene list does not sit in the page's own markup: the bundled film is
  // stored JSON-ENCODED inside <script type="__bundler/template">, and the
  // assignment lives in there as `window.OM_SCENES = "<json>"` with a second
  // layer of escaping. Decode the outer blob first, then the two JSON layers —
  // the same three-step the adapter itself performs when it swaps the list in.
  const holder = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  let page = html;
  if (holder) { try { page = JSON.parse(holder[1]); } catch { page = html; } }
  const m = /window\.OM_SCENES\s*=\s*("(?:[^"\\]|\\.)*")/.exec(page);
  if (!m) return null;
  let scenes;
  try { scenes = JSON.parse(JSON.parse(m[1])); }
  catch { return null; }
  if (!Array.isArray(scenes)) return null;
  return scenes.map((s) => {
    const shots = [];
    for (const [k, v] of Object.entries(s || {})) {
      if (!/^shot([1-6]|A|B)?$/.test(k) && k !== "image") continue;
      const p = typeof v === "string" ? v : (v && v.src) || "";
      const hit = /assets\/images\/\d+\.jpg/.exec(p);
      if (hit) shots.push(hit[0]);
    }
    return { beat: s, shots };
  });
}

function auditPack(pack, assets, owners) {
  const manifestPath = path.join(FRAMES, pack, "pack.json");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch { return { pack, skip: "no manifest" }; }
  let built;
  try {
    built = om.buildComposition({
      storyboard: storyboardOf(), dims: { width: 1920, height: 1080, fps: 30 },
      framePack: pack, assets, manifest,
    });
  } catch (e) { return { pack, skip: `build failed: ${String(e.message).slice(0, 60)}` }; }
  const cast = castOf(built.indexHtml);
  if (!cast) return { pack, skip: "no OM_SCENES payload" };

  // A BEAT IS NOT A SCENE, AND ASSUMING IT IS INVENTS FAILURES.
  //
  // The adapter's pace splitter cuts one narrated scene into two or more template
  // beats — measured on teampulse, nine scenes became EIGHTEEN beats of 2.5s. So
  // beat[i] is not scene[i], and comparing them by index reports the wrong owner
  // for almost every beat: an earlier draft of this audit "found" a 53.8% defect
  // rate that was entirely its own off-by-N. The beat carries the scene's copy,
  // and each fixture scene owns a token no other scene uses, so the beat can be
  // traced back to the scene it was cut from by reading its own words.
  const beatOwner = (beat) => {
    const text = JSON.stringify(beat).toLowerCase();
    let best = null, bestHits = 0;
    for (const sc of SCENES) {
      const hits = sc.marks.filter((w) => text.includes(w)).length;
      if (hits > bestHits) { bestHits = hits; best = sc.id; }
    }
    return bestHits ? best : null;   // a beat with no traceable copy is not scored
  };

  // THE UNIT IS THE BEAT, NOT THE SLOT. Several templates fill a media WALL —
  // four to six picture cards on one beat — and only one of those cards can ever
  // be the beat's own picture; scoring per slot therefore reports three "misses"
  // for a beat that did everything right. The question a viewer actually asks is
  // "is the thing I'm hearing about on the screen", so each beat is judged once:
  // does its own picture appear among what it draws?
  // Scored per SCENE, because the scene is the narration unit: the voiceover is
  // synthesized per scene and plays across every beat that scene was cut into, so
  // "is the picture I'm hearing about on screen" is answered once per scene, not
  // once per cut. A scene passes if its own picture reaches ANY of its beats.
  const ownerOf = new Map(assets.map((a) => [a.path, String(a.sceneId)]));
  const ownedBy = new Map(assets.map((a) => [String(a.sceneId), a.path]));
  const drawnBy = new Map();     // sceneId -> paths drawn on its beats
  const drawnLoose = new Set();  // paths drawn on beats this audit cannot attribute
  let placed = 0, untraceable = 0;
  for (const { beat, shots } of cast) {
    placed += shots.length;
    const sid = beatOwner(beat);
    if (TRACE) {
      console.log(`    beat ${String(beat.name || "?").padEnd(12)} -> ${String(sid || "untraceable").padEnd(11)} shots [${shots.map((p) => ownerOf.get(p) || "?").join(" ")}]`);
    }
    if (!sid) {
      // Some template beats carry no copy from the scene at all — a Reveal that
      // prints only the brand and the URL, for instance. This audit cannot tell
      // which scene such a beat was cut from, so its draws are held aside rather
      // than charged to a scene that may not own them.
      if (shots.length) { untraceable++; for (const p of shots) drawnLoose.add(p); }
      continue;
    }
    const list = drawnBy.get(sid) || [];
    list.push(...shots);
    drawnBy.set(sid, list);
  }
  let ownShown = 0, ownMissing = 0, noOwn = 0, blank = 0, unattributed = 0;
  const misses = [];
  for (const sc of SCENES) {
    const mine = ownedBy.get(sc.id);
    const shots = drawnBy.get(sc.id) || [];
    if (!mine) { noOwn++; continue; }
    if (shots.includes(mine)) { ownShown++; continue; }
    // Its picture reached the film on a beat this audit could not attribute. That
    // is a limit of the tracing, not a verdict — counting it as a miss would be
    // reporting the harness's blind spot as a pipeline defect.
    if (drawnLoose.has(mine)) { unattributed++; continue; }
    if (!shots.length) { blank++; misses.push(`${sc.id}<-nothing`); continue; }
    ownMissing++;
    misses.push(`${sc.id}<-${[...new Set(shots.map((p) => ownerOf.get(p) || "?"))].join("/")}`);
  }
  return { pack, placed, ownShown, ownMissing, noOwn, blank, unattributed, untraceable, misses };
}

function main() {
  let packs;
  if (NAMED) packs = NAMED.split(",").map((s) => s.trim()).filter(Boolean);
  else {
    const all = fs.readdirSync(FRAMES).filter((d) => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(FRAMES, d, "pack.json"), "utf8"));
        return String(m.renderer || "") === "omelette";
      } catch { return false; }
    }).sort();
    // A deterministic spread of the library, not its first N alphabetically —
    // packs cluster by family in name order and a prefix samples one grammar.
    packs = ALL ? all : all.filter((_, i) => i % Math.max(1, Math.round(all.length / SAMPLE)) === 0);
  }

  const assets = assetsFor(SUPPLY);
  const owners = ownersFor(SUPPLY);
  console.log(`beat-match audit — ${packs.length} pack(s), ${SCENES.length} beats, ${SUPPLY} picture(s) bought for [${owners.join(" ")}]\n`);

  const rows = [];
  const skipped = [];
  for (const p of packs) {
    const r = auditPack(p, assets, owners);
    if (r.skip) { skipped.push(`${p}: ${r.skip}`); continue; }
    rows.push(r);
    if (VERBOSE) {
      console.log(`  ${p.padEnd(24)} slots ${String(r.placed).padStart(3)}  own-shown ${r.ownShown}  own-MISSING ${r.ownMissing}  blank ${r.blank}  untraced ${r.unattributed}  no-own ${r.noOwn}${r.misses.length ? `   ${r.misses.join(" ")}` : ""}`);
    }
  }

  const T = rows.reduce((t, r) => ({
    placed: t.placed + r.placed, ownShown: t.ownShown + r.ownShown,
    ownMissing: t.ownMissing + r.ownMissing, noOwn: t.noOwn + r.noOwn,
    blank: t.blank + r.blank, unattributed: t.unattributed + r.unattributed,
  }), { placed: 0, ownShown: 0, ownMissing: 0, noOwn: 0, blank: 0, unattributed: 0 });
  // The denominator is scenes that HAD a picture of their own — the only scenes
  // where "showed the right one" is even a question.
  const owning = T.ownShown + T.ownMissing + T.blank + T.unattributed;
  const pct = (n) => owning ? `${((n / owning) * 100).toFixed(1)}%` : "n/a";

  console.log(`\n  packs audited       ${rows.length}${skipped.length ? `  (${skipped.length} skipped)` : ""}`);
  console.log(`  picture slots drawn ${String(T.placed).padStart(5)}`);
  console.log(`  scenes owning a pic ${String(owning).padStart(5)}`);
  console.log(`    shows it          ${String(T.ownShown).padStart(5)}  (${pct(T.ownShown)})`);
  console.log(`    shows OTHERS'     ${String(T.ownMissing).padStart(5)}  (${pct(T.ownMissing)})   <- THE DEFECT`);
  console.log(`    shows nothing     ${String(T.blank).padStart(5)}  (${pct(T.blank)})   <- bought and never drawn`);
  console.log(`    drawn, untraced   ${String(T.unattributed).padStart(5)}  (${pct(T.unattributed)})   <- shown on a beat carrying no scene copy`);
  console.log(`  scenes owning none  ${String(T.noOwn).padStart(5)}          (borrowing there is arithmetic, not a bug)`);

  const worst = rows.filter((r) => r.ownMissing + r.blank > 0).sort((a, b) => (b.ownMissing + b.blank) - (a.ownMissing + a.blank)).slice(0, 12);
  if (worst.length) {
    console.log(`\n  worst packs (beats that owned a picture and did not show it):`);
    for (const r of worst) console.log(`    ${r.pack.padEnd(24)} missing ${r.ownMissing}  blank ${r.blank}   ${r.misses.join(" ")}`);
  }
  if (skipped.length && VERBOSE) {
    console.log(`\n  skipped:`);
    for (const s of skipped) console.log(`    ${s}`);
  }
}

main();
