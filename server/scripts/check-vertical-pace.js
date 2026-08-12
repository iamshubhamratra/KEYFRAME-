// GATE: vertical films must cut briskly, fill every beat, and never slam a
// truncated fragment across the frame.
//
// Each rule here is a defect that reached a finished film:
//   PACE   — a template authored at a ~5s stroll was matched faithfully, so the
//            film cut once every 5s and read as slow motion.
//   SYNC   — the beats must still sum to the narration length, or the voice
//            drifts off the picture.
//   EMPTY  — a beat that declares a media wall but got no asset renders the
//            template's hatched placeholder: an empty screenshot card.
//   BARE   — a beat with no picture and no readable copy is an empty slide.
//   STUMP  — "75% of organizations report that Trello delivers value within 30
//            days" fitted into an 18-char pill became "75% OF", and it was slammed
//            across a frame next to "SIGN UP — IT'S".
//
// Structural only: no browser, so it is cheap enough to run on every change.
const fs = require("fs");
const path = require("path");
const om = require("../src/services/omelette_adapter.js");

const TPL_DIR = path.join(__dirname, "..", "public", "omelette-templates");
// Eased deliberately after review: at ~1.7s a cut arrives while the eye is still
// arriving, and the picture reads as racing the voice even though the timing is
// exact. A narrated sentence is now at most TWO cuts, each given at least 2s to
// land, so a short sentence stays whole. The ceiling still catches the failure
// this gate was built for — a film cutting once every 5s.
const MAX_BEAT = 3.2;   // seconds, AVERAGE — above this the film reads as a slideshow
const MIN_BEAT = 1.5;   // below this a beat is a flicker, not a cut
const MAX_HELD = 4.0;   // a single beat may run longer than the average, but not by much

// Packs whose renderer is a bundled portrait template.
const VERTICAL = {
  "stomp-office": "Stomp", "cadence-premium": "Cadence", "birdsong-field": "Birdsong",
  "showcase-vertical": "ShowcaseVertical", "reel": "Reel", "teampulse": "Teampulse",
  "fetch-vertical": "FetchVertical", "flight-vertical": "FlightVertical",
};

// Narration with the exact copy shapes that produced real defects: a long
// sentence bullet (stump source) and a dangling CTA.
const SRC = [
  { id: "s1", start: 0, duration: 5, kind: "hook", headline: "Work scattered everywhere", subtext: "Email, chats and lists pull your team apart.", bullets: ["Email", "Chats", "Lists"] },
  { id: "s2", start: 5, duration: 5, kind: "feature", headline: "One visual place", subtext: "Capture, organize and tackle every to-do.", bullets: ["75% of organizations report that Trello delivers value within 30 days", "Sign up — it's free!"] },
  { id: "s3", start: 10, duration: 5, kind: "feature", headline: "Automation built in", subtext: "No-code rules do the busywork.", bullets: ["Rules", "Buttons", "Commands"] },
  { id: "s4", start: 15, duration: 5, kind: "stat", headline: "Proven at work", subtext: "Teams see value fast.", stats: [{ value: "75%", label: "value in 30 days" }] },
  { id: "s5", start: 20, duration: 5, kind: "proof", headline: "Trusted by teams", subtext: "Millions of people plan here.", bullets: ["Visa", "Coinbase", "Zoom"] },
  { id: "s6", start: 25, duration: 5, kind: "cta", headline: "Start today", subtext: "Free to try.", cta: "Get Trello free" },
];
// Real narration is never a tidy 5s grid — the VO re-timing pass hands the
// builder uneven scenes, and that is where held beats hid. Check both shapes.
const UNEVEN = SRC.map((s, i) => ({ ...s, duration: [4.1, 3.2, 5.5, 2.9, 4.6, 3.8][i] || 4 }));
{
  let t = 0;
  for (const s of UNEVEN) { s.start = +t.toFixed(2); t += s.duration; }
}
const PROFILES = [{ name: "even", scenes: SRC }, { name: "uneven", scenes: UNEVEN }];
const TOTAL = SRC.reduce((a, s) => a + s.duration, 0);
const totalOf = (list) => list.reduce((a, s) => a + s.duration, 0);

const asset = (i) => ({
  path: `assets/images/page_${i}.png`, type: "image", source: "website",
  width: 2732, height: 1800, ratio: 1.518,
  alt: `REAL screenshot of the feature ${i} page`,
  cdScore: 80, cdProminence: i < 2 ? "hero" : "support", visionOk: true,
});

function beatsOf(html) {
  const m = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  let page; try { page = JSON.parse(m[1]); } catch { return null; }
  const sm = /window\.OM_SCENES\s*=\s*('[\s\S]*?'|"[\s\S]*?")\s*;/.exec(page);
  if (!sm) return null;
  try {
    const lit = sm[1];
    return JSON.parse(lit[0] === "'" ? lit.slice(1, -1) : JSON.parse(lit));
  } catch { return null; }
}

const WALL = /montage|gallery|fleet|wall|grid|explore|billboard|spread|cruise|deploy|sighting|line|assemble|showcase|surfaces|screens/i;
const hasShot = (s) => Object.keys(s).some((k) => /^shot(\d+|[AB])?$/.test(k) && String(s[k] || "").startsWith("assets/"));

// A trailing function word alone does NOT prove a stump: "Automation built in"
// legitimately ends on "in". What proves it is that the phrase is a TRUNCATED
// PREFIX of copy the storyboard actually wrote, and the cut left it dangling.
//   "Proven at work"  -> "PROVEN AT"   prefix + dangling => stump
//   "Automation built in" -> "BUILT IN" not a prefix (a tail) => reported separately
//   "Automation built in" -> itself     not truncated       => fine
const DANGLE = /^(of|the|a|an|and|or|to|for|with|in|on|at|by|from|as|but|so|is|are|was|it'?s|that|this|your|our|their)$/i;
// Keep the apostrophe: split "it's" into "it"+"s" and the dangling-word test
// stops seeing the contraction it is supposed to catch.
const norm = (s) => String(s).toLowerCase().replace(/[‘’]/g, "'")
  .replace(/[^\w%'\s]/g, " ").split(/\s+/).filter(Boolean);

// Every string the storyboard authored — the only honest source of on-screen copy.
const SOURCES = [];
for (const s of SRC) {
  for (const v of [s.headline, s.subtext, s.cta]) if (v) SOURCES.push(String(v));
  for (const b of s.bullets || []) SOURCES.push(String(b));
  for (const st of s.stats || []) if (st.label) SOURCES.push(String(st.label));
}
// Ground-truth sources for the self-test, so the rule is exercised on the exact
// sentences that produced shipped stumps.
if (process.argv.includes("--selftest")) {
  SOURCES.push("Inbox: pull in ideas fast", "81% chose ease of use", "Proven at work");
}
const SRC_WORDS = SOURCES.map(norm);
// keep SOURCES and SRC_WORDS index-aligned; drop nothing.

function classify(p) {
  const w = norm(p);
  if (!w.length) return null;
  if (/[—,]$/.test(p.trim())) return "dangling punctuation";
  // Copy the storyboard actually wrote is never a stump, even when it happens to
  // prefix a longer line: the bullet "Email" also opens the subtext "Email, chats
  // and lists pull your team apart."
  const key = w.join(" ");
  if (SRC_WORDS.some((s) => s.join(" ") === key)) return null;
  for (let si = 0; si < SRC_WORDS.length; si++) {
    const src = SRC_WORDS[si];
    if (w.length >= src.length) continue;
    const isPrefix = w.every((x, i) => x === src[i]);
    if (isPrefix) {
      // A prefix is fine when the cut lands on a clause boundary ("Sign up" out
      // of "Sign up — it's free!"). It is a stump when the sentence simply keeps
      // going ("Inbox: pull" out of "Inbox: pull in ideas fast"), whatever the
      // last word happens to be.
      const raw = SOURCES[si] || "";
      let i = 0;
      for (let n = 0; n < w.length && i < raw.length; n++) {
        while (i < raw.length && /\s/.test(raw[i])) i++;
        while (i < raw.length && !/\s/.test(raw[i])) i++;
      }
      while (i < raw.length && /\s/.test(raw[i])) i++;
      const atBoundary = i >= raw.length || /[—–\-:;,.!?)]/.test(raw[i]);
      if (!atBoundary || DANGLE.test(w[w.length - 1])) return `truncated prefix of "${src.join(" ")}"`;
    }
    const off = src.length - w.length;
    const isTail = off > 0 && w.every((x, i) => x === src[i + off]);
    // A headline slot showing only the TAIL of a sentence has lost its subject.
    if (isTail) return `tail-only of "${src.join(" ")}"`;
  }
  return null;
}

// Slots that legitimately carry a fragment: pills, tags, tickers, labels.
const FRAGMENT_OK = /^(chips|tags|items|caps|meta|ticker|eyebrow|kicker|avatarLabel|by|author|quoteBy|cta|brand|stats|pains|feats|roster)$/;
function stumps(scene) {
  const out = [];
  for (const [k, v] of Object.entries(scene)) {
    if (k === "url" || k === "logo" || k === "name" || k === "dur") continue;
    const vals = typeof v === "string" ? [v]
      : Array.isArray(v) ? v.flatMap((e) => typeof e === "string" ? [e] : (e && typeof e === "object" ? Object.values(e).filter((x) => typeof x === "string") : []))
      : [];
    for (const val of vals) {
      // A "|" split is the template's own line break, not a truncation — judge
      // the whole value, then each line only for dangling punctuation.
      const whole = String(val).replace(/\|/g, " ").trim();
      if (whole.length < 3) continue;
      if (FRAGMENT_OK.test(k)) {
        if (/[—,]$/.test(whole)) out.push(`${k}="${whole}" (dangling punctuation)`);
        continue;
      }
      const why = classify(whole);
      if (why) out.push(`${k}="${whole}" (${why})`);
    }
  }
  return out;
}

function wordCount(s) {
  let n = 0;
  for (const [k, v] of Object.entries(s)) {
    if (["name", "dur", "nat", "anim", "logo", "url"].includes(k)) continue;
    const push = (x) => { if (typeof x === "string") n += x.trim().split(/[\s|]+/).filter(Boolean).length; };
    if (typeof v === "string") push(v);
    else if (Array.isArray(v)) for (const e of v) {
      if (typeof e === "string") push(e);
      else if (e && typeof e === "object") Object.values(e).forEach(push);
    }
  }
  return n;
}

// A gate that cannot fail is worth nothing. `--selftest` proves the stump rule
// still fires on the fragments that actually shipped, and still leaves real copy
// alone — the false-positive half matters just as much.
if (process.argv.includes("--selftest")) {
  const CASES = [
    ["PROVEN AT", true],             // truncated "Proven at work"
    ["75% OF", true],                // truncated the long stat bullet
    ["Sign up — it's", true],        // dangling punctuation after the cut
    ["BUILT IN", true],              // tail of "Automation built in", subject lost
    ["Inbox: pull", true],           // shipped in a pill; source continues "in ideas fast"
    ["81% chose ease", true],        // shipped; source continues "of use"
    ["Automation built in", false],  // complete, merely ends on a preposition
    ["Sign up", false],              // a clean two-word label: the source breaks at "—"
    ["One visual place", false],
    ["Work scattered everywhere", false],
    ["Get Trello free", false],
  ];
  let bad = 0;
  for (const [txt, wantStump] of CASES) {
    const why = classify(txt);
    const got = !!why;
    if (got !== wantStump) { bad++; }
    console.log(`${got === wantStump ? "ok  " : "MISS"}  ${txt.padEnd(26)} expected ${wantStump ? "stump" : "clean"}${why ? "  <- " + why : ""}`);
  }
  console.log(bad ? `\nCHECKER BROKEN: ${bad} case(s) wrong` : "\nstump rule correct on all ground-truth cases");
  process.exit(bad ? 1 : 0);
}

let failing = 0, checked = 0;
const rows = [];
for (const [pack, tplName] of Object.entries(VERTICAL)) {
  let native = 0;
  let tplScenes = [];
  try {
    tplScenes = om.readTemplateScenes(fs.readFileSync(path.join(TPL_DIR, `${tplName}.html`), "utf8")) || [];
    const d = tplScenes.map((s) => Number(s.dur) || 0).filter(Boolean);
    if (d.length) native = d.reduce((a, b) => a + b, 0) / d.length;
  } catch { /* pack may not ship its template source */ }

  // Sweep the asset pool: empty cards surface when the pool is thin.
  const problems = [];
  let beats = 0, avg = 0, sum = 0;
  for (const prof of PROFILES) for (const n of [0, 2, 5, 10]) {
    const tag = `${prof.name}@${n}`;
    const profTotal = totalOf(prof.scenes);
    let built;
    try {
      built = om.buildComposition({
        storyboard: { title: "Trello", brand: "Trello", url: "trello.com", durationSec: profTotal, scenes: prof.scenes },
        dims: { width: 1080, height: 1920, fps: 30 }, framePack: pack,
        assets: Array.from({ length: n }, (_, i) => asset(i)),
      });
    } catch (e) { problems.push(`build failed ${tag}: ${e.message.slice(0, 60)}`); continue; }

    const arr = beatsOf(built.indexHtml);
    if (!arr || !arr.length) { problems.push(`no OM_SCENES ${tag}`); continue; }
    const durs = arr.map((s) => Number(s.dur) || 0);
    sum = durs.reduce((a, b) => a + b, 0);
    beats = arr.length; avg = sum / beats;

    if (avg > MAX_BEAT + 0.01) problems.push(`PACE ${avg.toFixed(2)}s/beat ${tag} (max ${MAX_BEAT})`);
    // The AVERAGE hid a real defect once: uniform 5s scenes split cleanly while
    // real 4.1s narration did not, so the mean looked fine and single beats sat
    // on screen for 4.1s. Judge the longest beat too.
    const longest = Math.max(...durs);
    if (longest > MAX_HELD) problems.push(`HELD ${longest.toFixed(2)}s single beat ${tag} (max ${MAX_HELD})`);
    if (durs.some((d) => d < MIN_BEAT - 0.01)) problems.push(`FLICKER ${Math.min(...durs).toFixed(2)}s beat ${tag}`);
    if (Math.abs(sum - profTotal) > 0.35) problems.push(`SYNC ${sum.toFixed(2)}s vs narration ${profTotal}s ${tag}`);

    const empty = arr.filter((s) => WALL.test(String(s.name || "")) && !hasShot(s));
    if (empty.length) problems.push(`EMPTY ${empty.length} media card(s) ${tag} (${empty.map((s) => s.name).join(",")})`);

    const bare = arr.filter((s) => !hasShot(s) && wordCount(s) < 2);
    if (bare.length) problems.push(`BARE ${bare.length} beat(s) ${tag} (${bare.map((s) => s.name).join(",")})`);

    // A cut is only worth making if it lands on a fresh shape. One film spent 7 of
    // 17 beats on FetchVertical's "Fetch" shape, which reveals its copy in the last
    // fifth of its window — so those beats read as empty scenery. Structural
    // emptiness checks cannot see that; shape share can.
    // Judge the MIDDLE only — the intro and outro are pinned and appear once by
    // design — and scale the limit to how many shapes the narration can actually
    // cast. Demanding 34% from a template with two fillable middles asks for the
    // arithmetically impossible; the rule must still catch the real defect, which
    // was one shape taking 7 of 17 beats while four were available.
    const mids = arr.slice(1, -1);
    if (mids.length >= 5) {
      const counts = new Map();
      for (const s of mids) counts.set(s.name, (counts.get(s.name) || 0) + 1);
      const [topName, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
      const distinct = counts.size;
      const limit = Math.max(0.45, 1.5 / Math.max(1, distinct));
      if (topN / mids.length > limit) {
        problems.push(`REPEAT "${topName}" is ${topN}/${mids.length} middle beats ${tag} (${distinct} distinct, max ${Math.round(limit * 100)}%)`);
      }
    }

    const st = arr.flatMap((s) => stumps(s).map((x) => `${s.name}.${x}`));
    if (st.length) problems.push(`STUMP ${tag}: ${st.slice(0, 2).join("; ")}`);

    // A CUT MUST ADVANCE THE THOUGHT. Splitting a narrated sentence into two beats
    // gave both the same copy, so the film read "CHAOS? / CHAOS? / SCATTERED WORK /
    // SCATTERED WORK": a new shape carrying no new information, which is what "the
    // slides don't match the voiceover" looks like to a viewer.
    const lead = (s) => String(s.headline || s.words || s.title || "").replace(/\|/g, " ").trim().toLowerCase();
    let repeats = 0, firstRepeat = "";
    for (let i = 1; i < arr.length; i++) {
      const a = lead(arr[i - 1]), b = lead(arr[i]);
      if (a && b && a === b) { repeats++; if (!firstRepeat) firstRepeat = b; }
    }
    if (repeats) problems.push(`ECHO ${repeats} consecutive beat(s) repeat the same headline ${tag} ("${firstRepeat.slice(0, 40)}")`);

    // NaN ON SCREEN. A compiled component that COUNTS a field renders "NaN" when
    // the field is missing — a shipped film showed a giant red NaN because the
    // element clone kept only the string keys. Compare each emitted element with
    // the shape the template authored: a dropped field is the defect, and it is
    // invisible in the payload (the payload just lacks a key).
    for (const s of arr) {
      const authored = (tplScenes || []).find((t) => t.name === s.name);
      if (!authored) continue;
      for (const [k, v] of Object.entries(s)) {
        if (!Array.isArray(v) || !v.length || typeof v[0] !== "object") continue;
        const proto = Array.isArray(authored[k]) ? authored[k][0] : null;
        if (!proto || typeof proto !== "object") continue;
        const numeric = Object.keys(proto).filter((kk) => typeof proto[kk] === "number");
        const missing = numeric.filter((kk) => v.some((el) => el && typeof el === "object" && !(kk in el)));
        if (missing.length) problems.push(`NaN-RISK ${tag}: ${s.name}.${k} drops numeric field(s) ${missing.join(",")} the template counts`);
      }
    }
  }

  checked++;
  const ok = problems.length === 0;
  if (!ok) failing++;
  rows.push({ pack, native, beats, avg, sum, ok, problems });
}

console.log("pack                 authored  beats  avg/beat  speed   total");
for (const r of rows) {
  const speed = r.native ? `${(r.native / (r.avg || 1)).toFixed(2)}x` : "—";
  console.log(`${r.pack.padEnd(20)} ${(r.native ? r.native.toFixed(2) + "s" : "—").padStart(8)}  ${String(r.beats).padStart(5)}  ${(r.avg.toFixed(2) + "s").padStart(8)}  ${speed.padStart(5)}  ${(r.sum.toFixed(1) + "s").padStart(6)}${r.ok ? "" : "   <-- FAIL"}`);
  for (const p of r.problems) console.log(`    ${p}`);
}
console.log(`\n${checked} vertical pack(s) checked, ${failing} failing.`);
console.log(`rules: beat <= ${MAX_BEAT}s and >= ${MIN_BEAT}s, total == narration, no empty media cards, no bare beats, no truncated stumps.`);
process.exit(failing ? 1 : 0);
