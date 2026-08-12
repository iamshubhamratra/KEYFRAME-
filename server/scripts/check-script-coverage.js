// GATE: every word the narrator speaks must appear on screen as type.
//
// Standing requirement. It regressed silently twice: the cue list reached the
// adapter empty and the whole script layer vanished, leaving only the mined
// headlines while the voiceover said far more — and nothing failed, because no
// check compared the spoken words with the rendered ones.
//
// Structural: builds a composition and reads the overlay's own phrase list back
// out of the emitted JS, so it measures what the film will actually display.
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

// Words the narrator says.
const norm = (s) => String(s).toLowerCase().replace(/[^\w\s']/g, " ").split(/\s+/).filter(Boolean);
const spoken = SRC.flatMap((s) => norm(s.voiceover));

function overlayWords(html) {
  // The overlay emits its phrases as <div class="kf-ph" ...><span>TEXT</span></div>
  const out = [];
  for (const m of html.matchAll(/class="kf-ph"[^>]*>\s*<span>([\s\S]*?)<\/span>/g)) {
    out.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  }
  return out;
}

// The overlay's time list, so we can also prove the phrases span the film.
function overlayTimes(html) {
  const m = /var IT=(\[\[[\s\S]*?\]\]);/.exec(html);
  if (!m) return [];
  try { return JSON.parse(m[1]); } catch { return []; }
}

let failing = 0;
console.log("pack                 phrases  spoken  onScreen  coverage  gaps");
for (const pack of VERTICAL) {
  let built;
  try {
    built = om.buildComposition({
      storyboard: { title: "Trello", brand: "Trello", url: "trello.com", durationSec: TOTAL, scenes: SRC },
      dims: { width: 1080, height: 1920, fps: 30 }, framePack: pack, assets: [],
      // deliberately NO scriptCues: the adapter must derive them from the
      // storyboard, which is the regression this gate exists to catch.
    });
  } catch (e) { console.log(`${pack.padEnd(20)} BUILD FAILED ${e.message.slice(0, 50)}`); failing++; continue; }

  const phrases = overlayWords(built.indexHtml);
  const shown = phrases.flatMap(norm);
  const shownSet = new Set(shown);
  const covered = spoken.filter((w) => shownSet.has(w)).length;
  const pct = spoken.length ? covered / spoken.length : 0;

  // Are there stretches of film with no script text at all?
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
  else if (pct < 0.95) bad.push(`only ${Math.round(pct * 100)}% of spoken words on screen`);
  if (gap > 1) bad.push(`${gap} silent gap(s) over 0.6s`);
  if (bad.length) failing++;

  console.log(`${pack.padEnd(20)} ${String(phrases.length).padStart(7)}  ${String(spoken.length).padStart(6)}  ${String(covered).padStart(8)}  ${(Math.round(pct * 100) + "%").padStart(8)}  ${String(gap).padStart(4)}${bad.length ? "   <-- " + bad.join("; ") : ""}`);
}

console.log(`\n${VERTICAL.length} pack(s) checked, ${failing} failing.`);
console.log("rule: >=95% of the spoken words render as on-screen type, with no silent stretch over 0.6s.");
process.exit(failing ? 1 : 0);
