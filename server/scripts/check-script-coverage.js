// GATE: the words the narrator speaks must appear on screen as type.
//
// Standing requirement (2026-07-31, restated 2026-08-05): ~80% of the narration
// on screen as big type. It regressed silently twice — the cue list reached the
// adapter empty and the whole layer vanished, and nothing failed because no
// check compared spoken words with rendered ones.
//
// REWRITTEN 2026-08-12 rather than restored: the previous version asserted one
// IMPLEMENTATION (the overlay must self-derive cues, >=95%, kf-ph nodes only).
// That produced a gate that reported "0% / NO SCRIPT LAYER" on films showing
// most of the narration in the template's own type — a red nobody could act on.
// This version:
//   * drives the composer exactly like production (graph.js): the "omelette"
//     default plus an explicit scriptCues list — the caller's silence means off,
//     by design, so the gate supplies what the caller supplies;
//   * measures the REQUIREMENT: spoken words on screen via the overlay OR the
//     pack's own mined slots (OM_SCENES copy), because both are on-screen type;
//   * sets the bar at the rule the user actually stated: 80%, not 95%;
//   * statically asserts the WIRING the old gate existed to protect — the
//     production call sites must pass a real cue list.
const fs = require("node:fs");
const path = require("node:path");
const om = require("../src/services/omelette_adapter.js");

const VERTICAL = ["stomp-office", "cadence-premium", "birdsong-field", "showcase-vertical",
  "reel", "teampulse", "fetch-vertical", "flight-vertical"];

// A storyboard shaped like the real one: every scene carries its spoken line.
const SRC = [
  { id: "s1", start: 0, duration: 4.6, kind: "hook", headline: "Work scattered everywhere",
    subtext: "Email, chats and lists pull your team apart.", bullets: ["Email", "Chats", "Lists"],
    voiceover: "Your work is scattered across email, chats and half-finished lists." },
  { id: "s2", start: 4.6, duration: 5.2, kind: "feature", headline: "One visual place",
    subtext: "Capture, organize and tackle every to-do.", bullets: ["Boards", "Cards"],
    voiceover: "Trello puts every to-do in one visual place you can actually see." },
  { id: "s3", start: 9.8, duration: 4.4, kind: "feature", headline: "Automation built in",
    subtext: "No-code rules do the busywork.", bullets: ["Rules", "Buttons"],
    voiceover: "No-code automation handles the busywork for you." },
  { id: "s4", start: 14.2, duration: 4.8, kind: "cta", headline: "Start today",
    subtext: "Free to try.", cta: "Get Trello free",
    voiceover: "Start today. Trello is free to try." },
];
const TOTAL = SRC.reduce((a, s) => a + s.duration, 0);

const norm = (s) => String(s).toLowerCase().replace(/[^\w\s']/g, " ").split(/\s+/).filter(Boolean);
const spoken = SRC.flatMap((s) => norm(s.voiceover));

// --- WIRING ASSERT --------------------------------------------------------------
// The regression class this gate was built for: a production path calling the
// composer with no cue list, silently disabling the layer for every film. The
// graph path must build voCues unconditionally and pass scriptCues at each
// composer call site.
function wiringAssert() {
  const g = fs.readFileSync(path.join(__dirname, "..", "src", "agents", "graph.js"), "utf8");
  const errs = [];
  if (!/const voCues = buildCues\(/.test(g)) errs.push("graph.js no longer builds voCues");
  const sites = (g.match(/scriptCues:\s*voCues/g) || []).length;
  if (sites < 3) errs.push(`graph.js passes scriptCues at only ${sites} composer call site(s) — expected >=3`);
  if (/const voCues = job\.captions_enabled/.test(g)) errs.push("voCues is gated on captions_enabled — the script layer must not depend on the subtitle toggle");
  return errs;
}

// --- on-screen text extraction ----------------------------------------------------
function overlayWords(html) {
  const out = [];
  for (const m of html.matchAll(/class="kf-ph"[^>]*>\s*<span>([\s\S]*?)<\/span>/g)) {
    out.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  }
  return out;
}
// The pack's own mined copy is on-screen type too. OM_SCENES is emitted as a
// JSON-escaped string; every string value in it (including inside arrays and
// nested objects) is text the film draws.
function minedWords(html) {
  const m = /window\.OM_SCENES = "((?:[^"\\]|\\.)*)"/.exec(html);
  if (!m) return [];
  let scenes;
  try { scenes = JSON.parse(JSON.parse(`"${m[1]}"`)); } catch { return []; }
  const out = [];
  (function walk(v) {
    if (typeof v === "string") { out.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") { Object.values(v).forEach(walk); }
  })(scenes);
  return out;
}
function overlayTimes(html) {
  const m = /var IT=(\[\[[\s\S]*?\]\]);/.exec(html);
  if (!m) return [];
  try { return JSON.parse(m[1]); } catch { return []; }
}

const wiringErrs = wiringAssert();
if (wiringErrs.length) {
  for (const e of wiringErrs) console.log(`WIRING: ${e}`);
}

let failing = wiringErrs.length ? 1 : 0;
console.log("pack                 phrases  spoken  onScreen  coverage  gaps");
for (const pack of VERTICAL) {
  let built;
  try {
    built = om.buildComposition({
      storyboard: { title: "Trello", brand: "Trello", url: "trello.com", durationSec: TOTAL, scenes: SRC },
      dims: { width: 1080, height: 1920, fps: 30 }, framePack: pack, assets: [],
      // Drive it the way graph.js does in production: the config default mode
      // plus an explicit cue list built from the scenes' spoken lines.
      scriptOverlay: "omelette",
      scriptCues: SRC.map((x) => ({ start: x.start, end: x.start + x.duration, text: x.voiceover })),
    });
  } catch (e) { console.log(`${pack.padEnd(20)} BUILD FAILED ${e.message.slice(0, 50)}`); failing++; continue; }

  const phrases = overlayWords(built.indexHtml);
  const shownSet = new Set([...phrases.flatMap(norm), ...minedWords(built.indexHtml).flatMap(norm)]);
  const covered = spoken.filter((w) => shownSet.has(w)).length;
  const pct = spoken.length ? covered / spoken.length : 0;

  // Silent stretches with no overlay phrase at all.
  const times = overlayTimes(built.indexHtml);
  let gap = 0;
  if (times.length) {
    let cur = 0;
    for (const [s, e] of times.map((x) => [Number(x[0]), Number(x[1])]).sort((a, b) => a[0] - b[0])) {
      if (s > cur + 0.6) gap++;
      cur = Math.max(cur, e);
    }
  }

  const bad = [];
  if (!phrases.length) bad.push("NO SCRIPT LAYER");
  else if (pct < 0.80) bad.push(`only ${Math.round(pct * 100)}% of spoken words on screen`);
  if (gap > 1) bad.push(`${gap} silent gap(s) over 0.6s`);
  if (bad.length) failing++;

  console.log(`${pack.padEnd(20)} ${String(phrases.length).padStart(7)}  ${String(spoken.length).padStart(6)}  ${String(covered).padStart(8)}  ${(Math.round(pct * 100) + "%").padStart(8)}  ${String(gap).padStart(4)}${bad.length ? "   <-- " + bad.join("; ") : ""}`);
}

console.log(`\n${VERTICAL.length} pack(s) checked, ${failing} failing.`);
console.log("rule: >=80% of the spoken words render as on-screen type (overlay or the pack's own slots), with no silent stretch over 0.6s.");
process.exit(failing ? 1 : 0);
